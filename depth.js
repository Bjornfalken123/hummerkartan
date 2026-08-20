// Sjökort/djupmodul återanvänder den verifierade Weatherbear v15-rådatakedjan.
let maptilerMap=null;
let MAPTILER_API_KEY="";
let weatherbearDepthProtocolRegistered=false;
const weatherbearDepthProtocolName="hummer-depth";
const nauticalDepthSourceId="hummer-depth-source";
const nauticalDepthLayerId="hummer-depth-layer";
const nauticalDepthContourSourceId="hummer-contours-source";
const nauticalDepthContourLineLayerId="hummer-contours-line";
const nauticalDepthContourLabelLayerId="hummer-contours-label";
const nauticalCoastlineLayerId="hummer-coastline";
const nauticalSeamarkSourceId="hummer-seamark-source";
const nauticalSeamarkLayerId="hummer-seamark-layer";
let weatherbearVectorTileModulesPromise=null;
let weatherbearWaterTileGeometryCache=new Map();
let weatherbearBaseWaterDescriptor=null;
let weatherbearBaseWaterTileConfigPromise=null;
const WEATHERBEAR_WATER_TILE_CACHE_LIMIT=128;
let nauticalDepthTilesTheme=null;
let weatherbearContourViewportTimer=null;
let weatherbearContourViewportBound=false;
let weatherbearContourViewportRequestId=0;
let currentTheme="day";
var NAUTICAL_SEAMARK_TILE_URL="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";
// Hela Sveriges kust med marginal runt Skagerrak, Kattegatt, Östersjön och Bottenviken.
var WEATHERBEAR_DEPTH_BOUNDS=[8.0,53.0,27.0,67.0];

function buildWeatherbearWorldGeoJson(){
  return {type:"FeatureCollection",features:[{type:"Feature",properties:{role:"night-dimmer"},geometry:{type:"Polygon",coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}}]};
}

function parseWeatherbearMercatorBbox(value){
  if(!value) return null;
  var parts=String(value).split(",").map(Number);
  if(parts.length!==4||parts.some(function(number){return !isFinite(number);})) return null;
  if(parts[0]>=parts[2]||parts[1]>=parts[3]) return null;
  return parts;
}

function weatherbearMercatorYToLatitude(y){
  var maxMercator=20037508.342789244;
  return Math.atan(Math.sinh((Number(y)/maxMercator)*Math.PI))*180/Math.PI;
}

function getWeatherbearDepthGapFillSettings(zoom,bboxValue,type){
  var z=Number(zoom),bbox=parseWeatherbearMercatorBbox(bboxValue);
  var renderScale=isFinite(z)&&z>=10?2:1;
  if(!bbox) return {zoom:z,pad:4,renderScale:renderScale,groundMetersPerPixel:null};
  var projectedMetersPerPixel=(bbox[2]-bbox[0])/(256*renderScale);
  var centerLatitude=weatherbearMercatorYToLatitude((bbox[1]+bbox[3])/2);
  var groundMetersPerPixel=projectedMetersPerPixel*Math.max(0.15,Math.cos(centerLatitude*Math.PI/180));
  // Padding hämtar samma externa kurva och vattengeometri över tile-gränsen,
  // så färgytorna blir sammanhängande utan en separat kustfyllnadsmodell.
  var bufferMeters=isFinite(z)&&z>=9?220:80;
  var radius=Math.max(1,Math.min(52,Math.ceil(bufferMeters/Math.max(0.1,groundMetersPerPixel))));
  var logicalPad=Math.ceil(radius/renderScale)+4;
  return {zoom:z,pad:Math.max(4,Math.min(56,logicalPad)),renderScale:renderScale,groundMetersPerPixel:groundMetersPerPixel};
}

function createWeatherbearDepthCanvas(width,height){
  if(typeof OffscreenCanvas!=="undefined") return new OffscreenCanvas(width,height);
  var canvas=document.createElement("canvas");
  canvas.width=width;
  canvas.height=height;
  return canvas;
}

function weatherbearCanvasToPngArrayBuffer(canvas){
  if(canvas&&typeof canvas.convertToBlob==="function"){
    return canvas.convertToBlob({type:"image/png"}).then(function(blob){return blob.arrayBuffer();});
  }
  return new Promise(function(resolve,reject){
    if(!canvas||typeof canvas.toBlob!=="function"){reject(new Error("Canvas kan inte exportera PNG"));return;}
    canvas.toBlob(function(blob){
      if(!blob){reject(new Error("PNG-export misslyckades"));return;}
      blob.arrayBuffer().then(resolve,reject);
    },"image/png");
  });
}

function weatherbearSmoothstep(edge0,edge1,value){
  if(value<=edge0) return 0;
  if(value>=edge1) return 1;
  var t=(value-edge0)/(edge1-edge0);
  return t*t*(3-2*t);
}

var WEATHERBEAR_DEPTH_BANDS=[
  {min:0,max:2,representative:1,signature:[255,64,32]},
  {min:2,max:3,representative:2.5,signature:[32,208,96]},
  {min:3,max:6,representative:4.5,signature:[32,96,255]},
  {min:6,max:10,representative:8,signature:[255,208,0]},
  {min:10,max:20,representative:15,signature:[255,64,192]},
  {min:20,max:50,representative:35,signature:[0,208,255]},
  {min:50,max:Infinity,representative:75,signature:[128,64,255]}
];
var WEATHERBEAR_DEPTH_PALETTES={
  day:[
    [75,169,216],
    [120,194,232],
    [169,217,243],
    [204,233,251],
    [226,242,255],
    [242,249,255],
    [255,255,255]
  ],
  night:[
    [47,61,64],
    [40,54,58],
    [34,47,51],
    [28,40,45],
    [22,33,38],
    [17,26,31],
    [7,12,16]
  ]
};

function getWeatherbearDepthPalette(theme){
  return WEATHERBEAR_DEPTH_PALETTES[theme==="night"?"night":"day"];
}

function getWeatherbearDepthBandIndex(depth){
  var d=Math.max(0,Number(depth)||0);
  for(var i=0;i<WEATHERBEAR_DEPTH_BANDS.length;i++){
    if(d<WEATHERBEAR_DEPTH_BANDS[i].max||i===WEATHERBEAR_DEPTH_BANDS.length-1) return i;
  }
  return WEATHERBEAR_DEPTH_BANDS.length-1;
}

function getWeatherbearDepthBandRepresentative(index){
  var i=Math.max(0,Math.min(WEATHERBEAR_DEPTH_BANDS.length-1,Math.round(Number(index)||0)));
  return WEATHERBEAR_DEPTH_BANDS[i].representative;
}

function decodeWeatherbearDepthSample(r,g,b,alpha){
  // Interna signaturfärger används endast mellan rågrid och renderingssteget. Det är robustare
  // än gråskalekoder, som kunde förväxlas med ett vanligt renderat WMS-svar.
  // Delvis transparenta kustpixlar används aldrig som källa.
  if(Number(alpha)<245) return null;
  var nearestIndex=-1,nearestDistance=Infinity;
  for(var i=0;i<WEATHERBEAR_DEPTH_BANDS.length;i++){
    var signature=WEATHERBEAR_DEPTH_BANDS[i].signature;
    var dr=Number(r)-signature[0],dg=Number(g)-signature[1],db=Number(b)-signature[2];
    var distance=dr*dr+dg*dg+db*db;
    if(distance<nearestDistance){nearestDistance=distance;nearestIndex=i;}
  }
  // PNG och nearest-neighbour ska ge exakt färg. En liten tolerans tillåter
  // endast ofarliga färgprofil-/canvasavvikelser, inte en främmande kartstil.
  if(nearestIndex<0||nearestDistance>32*32) return null;
  return getWeatherbearDepthBandRepresentative(nearestIndex);
}

function colorForWeatherbearDepth(depth,theme){
  var palette=getWeatherbearDepthPalette(theme);
  var band=getWeatherbearDepthBandIndex(depth);
  return palette[band].slice();
}


function weatherbearMercatorXToLongitude(x){
  return (Number(x)/20037508.342789244)*180;
}

function findWeatherbearGridInterval(values,target){
  if(!Array.isArray(values)||!values.length||!isFinite(Number(target))) return null;
  if(values.length===1) return {low:0,high:0,t:0};
  var value=Number(target);
  if(value<Number(values[0])||value>Number(values[values.length-1])) return null;
  var low=0,high=values.length-1;
  while(high-low>1){
    var mid=(low+high)>>1;
    if(Number(values[mid])<=value) low=mid; else high=mid;
  }
  var a=Number(values[low]),b=Number(values[high]);
  var t=b===a?0:(value-a)/(b-a);
  return {low:low,high:high,t:Math.max(0,Math.min(1,t))};
}

function sampleWeatherbearRawDepthGrid(grid,longitude,latitude){
  if(!grid||!Array.isArray(grid.latitudes)||!Array.isArray(grid.longitudes)||!Array.isArray(grid.depthDm)) return null;
  var latInterval=findWeatherbearGridInterval(grid.latitudes,latitude);
  var lonInterval=findWeatherbearGridInterval(grid.longitudes,longitude);
  if(!latInterval||!lonInterval) return null;
  var lonCount=grid.longitudes.length,noData=Number(grid.noData);
  function valueAt(latIndex,lonIndex){
    var encoded=Number(grid.depthDm[latIndex*lonCount+lonIndex]);
    return isFinite(encoded)&&encoded!==noData?encoded/10:null;
  }
  var tx=lonInterval.t,ty=latInterval.t;
  var points=[
    {value:valueAt(latInterval.low,lonInterval.low),weight:(1-tx)*(1-ty)},
    {value:valueAt(latInterval.low,lonInterval.high),weight:tx*(1-ty)},
    {value:valueAt(latInterval.high,lonInterval.low),weight:(1-tx)*ty},
    {value:valueAt(latInterval.high,lonInterval.high),weight:tx*ty}
  ];
  var weightedDepth=0,validWeight=0,validCount=0;
  points.forEach(function(point){
    if(point.value==null||!isFinite(point.value)||point.weight<=0) return;
    weightedDepth+=point.value*point.weight;
    validWeight+=point.weight;
    validCount++;
  });
  // Minst drygt halva den bilinära vikten måste komma från verkliga
  // mätceller. En ensam giltig hörnpunkt får inte smetas långt in i no-data;
  // kustfyllningen hanterar i stället den delen med landmask och kurvlogik.
  if(!validCount||validWeight<0.55) return null;
  return weightedDepth/validWeight;
}

function buildWeatherbearDepthImageFromGrid(grid,settings){
  var bbox=grid&&Array.isArray(grid.bboxMercator)?grid.bboxMercator.map(Number):null;
  if(!bbox||bbox.length!==4||bbox.some(function(value){return !isFinite(value);})) return null;
  var scale=Math.max(1,Math.min(2,Math.round(Number(settings&&settings.renderScale)||1)));
  var pad=Math.max(0,Math.round(Number(settings&&settings.pad)||0));
  var size=256*scale+pad*scale*2;
  var canvas=createWeatherbearDepthCanvas(size,size);
  var context=canvas.getContext("2d",{willReadFrequently:true});
  var imageData=context.createImageData(size,size),pixels=imageData.data;
  var depthValues=new Float32Array(size*size);depthValues.fill(NaN);
  var minX=bbox[0],minY=bbox[1],maxX=bbox[2],maxY=bbox[3];
  for(var py=0;py<size;py++){
    var mercatorY=maxY-((py+0.5)/size)*(maxY-minY);
    var latitude=weatherbearMercatorYToLatitude(mercatorY);
    for(var px=0;px<size;px++){
      var mercatorX=minX+((px+0.5)/size)*(maxX-minX);
      var longitude=weatherbearMercatorXToLongitude(mercatorX);
      var depth=sampleWeatherbearRawDepthGrid(grid,longitude,latitude);
      if(depth==null||!isFinite(Number(depth))||Number(depth)<0) continue;
      var index=py*size+px,band=getWeatherbearDepthBandIndex(depth);
      var signature=WEATHERBEAR_DEPTH_BANDS[band].signature;
      var offset=index*4;
      depthValues[index]=Number(depth);
      pixels[offset]=signature[0];pixels[offset+1]=signature[1];pixels[offset+2]=signature[2];pixels[offset+3]=255;
    }
  }
  context.putImageData(imageData,0,0);
  return {canvas:canvas,imageData:imageData,depthValues:depthValues,bboxMercator:bbox};
}


function rasterizeWeatherbearExternalContours(featureCollection,bbox,width,height){
  var count=width*height,barrier=new Uint8Array(count),levels=new Float32Array(count);
  levels.fill(NaN);
  if(!featureCollection||!Array.isArray(featureCollection.features)||!bbox||bbox.length!==4) return {barrier:barrier,levels:levels,featureCount:0};
  var minX=Number(bbox[0]),minY=Number(bbox[1]),maxX=Number(bbox[2]),maxY=Number(bbox[3]);
  if(!isFinite(minX)||!isFinite(minY)||!isFinite(maxX)||!isFinite(maxY)||minX>=maxX||minY>=maxY) return {barrier:barrier,levels:levels,featureCount:0};
  var lineRadius=Math.max(1,Math.round(Math.max(width,height)/700));
  function mark(x,y,depth){
    var cx=Math.round(x),cy=Math.round(y);
    for(var dy=-lineRadius;dy<=lineRadius;dy++){
      var py=cy+dy;if(py<0||py>=height) continue;
      for(var dx=-lineRadius;dx<=lineRadius;dx++){
        var px=cx+dx;if(px<0||px>=width) continue;
        var index=py*width+px;barrier[index]=1;
        if(!isFinite(levels[index])||Math.abs(depth)<Math.abs(levels[index])) levels[index]=depth;
      }
    }
  }
  function project(coordinate){
    var mx=Number(coordinate&&coordinate[0]),my=Number(coordinate&&coordinate[1]);
    if(!isFinite(mx)||!isFinite(my)) return null;
    return {x:(mx-minX)/(maxX-minX)*(width-1),y:(maxY-my)/(maxY-minY)*(height-1)};
  }
  function drawLine(line,depth){
    if(!Array.isArray(line)||line.length<2) return;
    for(var pointIndex=1;pointIndex<line.length;pointIndex++){
      var a=project(line[pointIndex-1]),b=project(line[pointIndex]);
      if(!a||!b) continue;
      var steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*1.45));
      for(var step=0;step<=steps;step++){
        var t=step/steps;mark(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,depth);
      }
    }
  }
  var accepted=0;
  featureCollection.features.forEach(function(feature){
    var geometry=feature&&feature.geometry,depth=Math.abs(Number(feature&&feature.properties&&feature.properties.depth));
    if(!geometry||!isFinite(depth)) return;
    var thresholds=[2,3,6,10,20,50],matchedDepth=null;
    for(var thresholdIndex=0;thresholdIndex<thresholds.length;thresholdIndex++){
      if(Math.abs(depth-thresholds[thresholdIndex])<=0.25){matchedDepth=thresholds[thresholdIndex];break;}
    }
    if(matchedDepth==null) return;
    depth=matchedDepth;
    if(geometry.type==="LineString") drawLine(geometry.coordinates,depth);
    else if(geometry.type==="MultiLineString"&&Array.isArray(geometry.coordinates)) geometry.coordinates.forEach(function(line){drawLine(line,depth);});
    else return;
    accepted++;
  });
  return {barrier:barrier,levels:levels,featureCount:accepted};
}

function renderWeatherbearContourGuidedDepth(imageData,rawDepthValues,waterMaskData,contours,bbox,theme){
  var width=imageData.width,height=imageData.height,count=width*height,pixels=imageData.data;
  var waterMask=waterMaskData&&waterMaskData.binary?waterMaskData.binary:waterMaskData;
  var coverage=waterMaskData&&waterMaskData.coverage?waterMaskData.coverage:null;
  if(!waterMask||waterMask.length!==count) return {imageData:imageData,componentCount:0,contourCount:0};
  var raster=rasterizeWeatherbearExternalContours(contours,bbox,width,height),barrier=raster.barrier,barrierLevels=raster.levels;
  // Om WFS tillfälligt saknar kurvor används rådjupet direkt per pixel. Det får
  // aldrig reduceras till en enda färg för hela tile-rutan.
  if(!raster.featureCount){
    var fallbackBands=new Int8Array(count);fallbackBands.fill(-1);
    var fallbackQueue=new Int32Array(count),fallbackHead=0,fallbackTail=0;
    for(var rawIndex=0;rawIndex<count;rawIndex++){
      var rawValue=rawDepthValues&&rawDepthValues.length===count?Number(rawDepthValues[rawIndex]):NaN;
      if(waterMask[rawIndex]&&isFinite(rawValue)&&rawValue>=0){
        fallbackBands[rawIndex]=getWeatherbearDepthBandIndex(rawValue);
        fallbackQueue[fallbackTail++]=rawIndex;
      }
    }
    while(fallbackHead<fallbackTail){
      var current=fallbackQueue[fallbackHead++],cx=current%width,cy=(current/width)|0,currentBand=fallbackBands[current];
      var neighbours=[current-1,current+1,current-width,current+width];
      for(var neighbourIndex=0;neighbourIndex<4;neighbourIndex++){
        if((neighbourIndex===0&&cx===0)||(neighbourIndex===1&&cx===width-1)||(neighbourIndex===2&&cy===0)||(neighbourIndex===3&&cy===height-1)) continue;
        var neighbour=neighbours[neighbourIndex];
        if(!waterMask[neighbour]||fallbackBands[neighbour]>=0) continue;
        fallbackBands[neighbour]=currentBand;fallbackQueue[fallbackTail++]=neighbour;
      }
    }
    var fallbackPalette=getWeatherbearDepthPalette(theme);
    for(var fallbackIndex=0;fallbackIndex<count;fallbackIndex++){
      var fallbackOffset=fallbackIndex*4;
      if(!waterMask[fallbackIndex]){pixels[fallbackOffset]=0;pixels[fallbackOffset+1]=0;pixels[fallbackOffset+2]=0;pixels[fallbackOffset+3]=0;continue;}
      var fallbackBand=fallbackBands[fallbackIndex];
      if(fallbackBand<0){
        var fx=fallbackIndex%width,fy=(fallbackIndex/width)|0,touchesFallbackLand=false;
        if(fx>0&&!waterMask[fallbackIndex-1]) touchesFallbackLand=true;
        if(fx+1<width&&!waterMask[fallbackIndex+1]) touchesFallbackLand=true;
        if(fy>0&&!waterMask[fallbackIndex-width]) touchesFallbackLand=true;
        if(fy+1<height&&!waterMask[fallbackIndex+width]) touchesFallbackLand=true;
        fallbackBand=touchesFallbackLand?0:5;
      }
      var fallbackColor=fallbackPalette[fallbackBand];
      pixels[fallbackOffset]=fallbackColor[0];pixels[fallbackOffset+1]=fallbackColor[1];pixels[fallbackOffset+2]=fallbackColor[2];pixels[fallbackOffset+3]=coverage&&coverage.length===count?coverage[fallbackIndex]:255;
    }
    return {imageData:imageData,componentCount:0,contourCount:0};
  }
  var componentIds=new Int32Array(count);componentIds.fill(-1);
  var queue=new Int32Array(count),components=[];
  var directions=[-1,1,-width,width];
  for(var start=0;start<count;start++){
    if(!waterMask[start]||barrier[start]||componentIds[start]>=0) continue;
    var id=components.length,head=0,tail=0;queue[tail++]=start;componentIds[start]=id;
    var bandCounts=[0,0,0,0,0,0,0],sampleCount=0,touchesLand=false,pixelCount=0;
    while(head<tail){
      var index=queue[head++];pixelCount++;
      var sourceDepth=rawDepthValues&&rawDepthValues.length===count?Number(rawDepthValues[index]):NaN;
      if(isFinite(sourceDepth)&&sourceDepth>=0){bandCounts[getWeatherbearDepthBandIndex(sourceDepth)]++;sampleCount++;}
      var x=index%width,y=(index/width)|0;
      if(x===0||x===width-1||y===0||y===height-1){}
      for(var d=0;d<4;d++){
        var next=index+directions[d];
        if((d===0&&x===0)||(d===1&&x===width-1)||(d===2&&y===0)||(d===3&&y===height-1)) continue;
        if(!waterMask[next]){touchesLand=true;continue;}
        if(barrier[next]||componentIds[next]>=0) continue;
        componentIds[next]=id;queue[tail++]=next;
      }
    }
    var band=-1,bestCount=0;
    for(var bandIndex=0;bandIndex<bandCounts.length;bandIndex++) if(bandCounts[bandIndex]>bestCount){bestCount=bandCounts[bandIndex];band=bandIndex;}
    components.push({band:band,sampleCount:sampleCount,touchesLand:touchesLand,pixelCount:pixelCount,edges:[]});
  }

  // Varje extern kurva skapar en relation mellan de två vattenytor som den skiljer åt.
  // Djupvärdet på kurvan avgör vilket band som ligger på den grundare respektive djupare sidan.
  for(var barrierIndex=0;barrierIndex<count;barrierIndex++){
    if(!barrier[barrierIndex]||!waterMask[barrierIndex]) continue;
    var bx=barrierIndex%width,by=(barrierIndex/width)|0,adjacent=[];
    for(var ddy=-1;ddy<=1;ddy++){
      var ny=by+ddy;if(ny<0||ny>=height) continue;
      for(var ddx=-1;ddx<=1;ddx++){
        var nx=bx+ddx;if(nx<0||nx>=width||(ddx===0&&ddy===0)) continue;
        var componentId=componentIds[ny*width+nx];
        if(componentId>=0&&adjacent.indexOf(componentId)===-1) adjacent.push(componentId);
      }
    }
    if(adjacent.length<2) continue;
    var contourDepth=Number(barrierLevels[barrierIndex]);
    if(!isFinite(contourDepth)) continue;
    for(var a=0;a<adjacent.length;a++) for(var b=a+1;b<adjacent.length;b++){
      components[adjacent[a]].edges.push({other:adjacent[b],depth:contourDepth});
      components[adjacent[b]].edges.push({other:adjacent[a],depth:contourDepth});
    }
  }

  // Propagera band från komponenter som innehåller rådjup. Kurvans nivå är facit för
  // hur bandet byter sida: exempelvis skiljer 6 m-kurvan 3–6 från 6–10 m.
  for(var pass=0;pass<12;pass++){
    var changed=false;
    for(var componentIndex=0;componentIndex<components.length;componentIndex++){
      var component=components[componentIndex];if(component.band>=0) continue;
      var votes=[0,0,0,0,0,0,0];
      component.edges.forEach(function(edge){
        var other=components[edge.other];if(!other||other.band<0) return;
        var deeperBand=getWeatherbearDepthBandIndex(Number(edge.depth)+0.001);
        var shallowerBand=Math.max(0,deeperBand-1);
        var candidate=other.band<=shallowerBand?deeperBand:shallowerBand;
        votes[candidate]++;
      });
      var selected=-1,selectedVotes=0;
      for(var voteBand=0;voteBand<votes.length;voteBand++) if(votes[voteBand]>selectedVotes){selectedVotes=votes[voteBand];selected=voteBand;}
      if(selected>=0){component.band=selected;changed=true;}
    }
    if(!changed) break;
  }

  // Endast verkliga luckor som inte kan lösas av kurvor eller rådjup använder reservregeln.
  // En kustansluten yta blir grund; en fristående havsyta blir djup. Utseendet markeras
  // inte separat enligt valt alternativ A.
  components.forEach(function(component){
    if(component.band<0) component.band=component.touchesLand?0:5;
  });

  var palette=getWeatherbearDepthPalette(theme),pixelBands=new Int8Array(count);pixelBands.fill(-1);
  for(var componentPixel=0;componentPixel<count;componentPixel++){
    var owner=componentIds[componentPixel];
    if(owner>=0&&components[owner]) pixelBands[componentPixel]=components[owner].band;
  }
  // Fyll själva kurvpixlarna från angränsande ytor så att inga vita remsor uppstår.
  for(var lineIndex=0;lineIndex<count;lineIndex++){
    if(!waterMask[lineIndex]||!barrier[lineIndex]) continue;
    var lx=lineIndex%width,ly=(lineIndex/width)|0,chosen=7;
    for(var ldy=-1;ldy<=1;ldy++){
      var lny=ly+ldy;if(lny<0||lny>=height) continue;
      for(var ldx=-1;ldx<=1;ldx++){
        var lnx=lx+ldx;if(lnx<0||lnx>=width) continue;
        var neighbourBand=pixelBands[lny*width+lnx];if(neighbourBand>=0) chosen=Math.min(chosen,neighbourBand);
      }
    }
    if(chosen===7){
      var raw=rawDepthValues&&rawDepthValues.length===count?Number(rawDepthValues[lineIndex]):NaN;
      chosen=isFinite(raw)?getWeatherbearDepthBandIndex(raw):0;
    }
    pixelBands[lineIndex]=chosen;
  }
  for(var i=0;i<count;i++){
    var offset=i*4,band=pixelBands[i];
    if(!waterMask[i]||band<0){pixels[offset]=0;pixels[offset+1]=0;pixels[offset+2]=0;pixels[offset+3]=0;continue;}
    var color=palette[Math.max(0,Math.min(palette.length-1,band))];
    pixels[offset]=color[0];pixels[offset+1]=color[1];pixels[offset+2]=color[2];pixels[offset+3]=coverage&&coverage.length===count?coverage[i]:255;
  }
  return {imageData:imageData,componentCount:components.length,contourCount:raster.featureCount};
}

async function processWeatherbearRawDepthGrid(response,settings,waterMask,theme,contourResponse){
  var emptyCanvas=createWeatherbearDepthCanvas(256,256);
  if(!response||!response.ok||response.status===204) return weatherbearCanvasToPngArrayBuffer(emptyCanvas);
  var grid,contours={type:"FeatureCollection",features:[]};
  try{grid=await response.json();}catch(error){console.warn("Rått djupgrid kunde inte avkodas",error);return weatherbearCanvasToPngArrayBuffer(emptyCanvas);}
  if(contourResponse&&contourResponse.ok){
    try{contours=await contourResponse.json();}catch(error){console.warn("Externa djupkurvor kunde inte avkodas",error);}
  }
  var built=buildWeatherbearDepthImageFromGrid(grid,settings);
  if(!built) return weatherbearCanvasToPngArrayBuffer(emptyCanvas);
  var imageData=built.imageData,canvas=built.canvas;
  var effectiveMask=weatherbearMaskHasWater(waterMask)?waterMask:buildWeatherbearIntrinsicDepthMask(imageData,"fill");
  if(!effectiveMask) return weatherbearCanvasToPngArrayBuffer(emptyCanvas);
  if(!applyWeatherbearWaterMask(imageData,effectiveMask)) return weatherbearCanvasToPngArrayBuffer(emptyCanvas);
  var rendered=renderWeatherbearContourGuidedDepth(imageData,built.depthValues,effectiveMask,contours,built.bboxMercator,theme);
  var context=canvas.getContext("2d",{willReadFrequently:true});
  context.putImageData(rendered.imageData,0,0);
  var cropped=cropWeatherbearDepthCanvas(canvas,settings&&settings.pad||0,settings&&settings.renderScale||1);
  return weatherbearCanvasToPngArrayBuffer(cropped);
}

function loadWeatherbearVectorTileModules(){
  if(!weatherbearVectorTileModulesPromise){
    weatherbearVectorTileModulesPromise=Promise.all([
      import("./vendor/pbf.js?v=1"),
      import("./vendor/vector-tile.js?v=1")
    ]).then(function(modules){
      return {Pbf:modules[0].default,VectorTile:modules[1].VectorTile};
    });
  }
  return weatherbearVectorTileModulesPromise;
}

function findWeatherbearBaseWaterDescriptor(){
  if(weatherbearBaseWaterDescriptor) return weatherbearBaseWaterDescriptor;
  if(!maptilerMap||!maptilerMap.getStyle) return null;
  var style=maptilerMap.getStyle()||{};
  var layers=Array.isArray(style.layers)?style.layers:[];
  var sources=style.sources||{};
  var candidates=[];

  for(var i=0;i<layers.length;i++){
    var layer=layers[i]||{};
    if(layer["source-layer"]!=="water"||!layer.source||layer.type!=="fill") continue;
    var source=sources[layer.source];
    if(!source||source.type!=="vector") continue;
    var score=10;
    if(!layer.filter) score+=20;
    if(layer.layout&&layer.layout.visibility==="none") score-=10;
    candidates.push({
      score:score,
      index:i,
      layerId:layer.id||null,
      sourceId:layer.source,
      sourceLayer:"water",
      sourceDefinition:source,
      filter:layer.filter||null
    });
  }

  // Klientens pixelmask kan i nuläget inte tolka godtyckliga MapLibre-filter.
  // För exakt geometri används därför endast en ofiltrerad vattenfyllning.
  var exact=candidates.filter(function(candidate){return !candidate.filter;});
  exact.sort(function(a,b){return b.score-a.score||b.index-a.index;});
  if(exact.length){
    weatherbearBaseWaterDescriptor=exact[0];
    weatherbearBaseWaterDescriptor.maskFilterExact=true;
    return weatherbearBaseWaterDescriptor;
  }

  // Robust reservväg: vissa MapTiler-stilar har bara filtrerade water-fill-lager.
  // Källan och source-layer är fortfarande samma som baskartan; filtret kan däremot
  // inte alltid återskapas i pixelmasken. Detta får aldrig stoppa själva djuplagret.
  candidates.sort(function(a,b){return b.score-a.score||b.index-a.index;});
  if(candidates.length){
    weatherbearBaseWaterDescriptor=candidates[0];
    weatherbearBaseWaterDescriptor.maskFilterExact=false;
    console.warn("MapTilers vattenkälla hittades, men fill-lagret är filtrerat. Djuplagret visas med konservativ maskreserv.");
    return weatherbearBaseWaterDescriptor;
  }
  return null;
}

function appendWeatherbearMapTilerKey(url){
  var value=String(url||"");
  if(value.indexOf("api.maptiler.com")===-1||/[?&]key=/.test(value)) return value;
  return value+(value.indexOf("?")>=0?"&":"?")+"key="+encodeURIComponent(MAPTILER_API_KEY);
}

function getWeatherbearBaseWaterTileConfig(){
  if(weatherbearBaseWaterTileConfigPromise) return weatherbearBaseWaterTileConfigPromise;
  weatherbearBaseWaterTileConfigPromise=(async function(){
    var descriptor=findWeatherbearBaseWaterDescriptor();
    var source=descriptor&&descriptor.sourceDefinition||null;
    var sourceLayer=descriptor&&descriptor.sourceLayer||"water";
    var tiles=source&&Array.isArray(source.tiles)?source.tiles.slice():null;
    var minzoom=source&&isFinite(Number(source.minzoom))?Number(source.minzoom):0;
    var maxzoom=source&&isFinite(Number(source.maxzoom))?Number(source.maxzoom):15;

    if((!tiles||!tiles.length)&&source&&source.url){
      var tileJsonUrl=appendWeatherbearMapTilerKey(source.url);
      if(/^maptiler:\/\//.test(tileJsonUrl)) tileJsonUrl="";
      if(tileJsonUrl){
        var response=await fetch(tileJsonUrl,{headers:{Accept:"application/json"}});
        if(!response.ok) throw new Error("MapTiler TileJSON "+response.status);
        var tileJson=await response.json();
        tiles=Array.isArray(tileJson&&tileJson.tiles)?tileJson.tiles.slice():null;
        if(isFinite(Number(tileJson&&tileJson.minzoom))) minzoom=Number(tileJson.minzoom);
        if(isFinite(Number(tileJson&&tileJson.maxzoom))) maxzoom=Number(tileJson.maxzoom);
      }
    }

    // Ingen annan MapTiler-källa får användas som reserv: en sådan reserv kan ha
    // en annan kustversion och återinföra just den förskjutning som masken ska lösa.
    if(!tiles||!tiles.length) throw new Error("Den aktiva MapTiler-stilens exakta vattenkälla saknar åtkomliga tile-adresser");
    return {tiles:tiles.map(appendWeatherbearMapTilerKey),sourceLayer:sourceLayer,minzoom:minzoom,maxzoom:maxzoom,sourceId:descriptor&&descriptor.sourceId||null};
  })().catch(function(error){
    weatherbearBaseWaterTileConfigPromise=null;
    throw error;
  });
  return weatherbearBaseWaterTileConfigPromise;
}

function trimWeatherbearWaterTileCache(){
  while(weatherbearWaterTileGeometryCache.size>WEATHERBEAR_WATER_TILE_CACHE_LIMIT){
    var firstKey=weatherbearWaterTileGeometryCache.keys().next().value;
    weatherbearWaterTileGeometryCache.delete(firstKey);
  }
}

function buildWeatherbearVectorTileUrl(template,z,x,y){
  return appendWeatherbearMapTilerKey(String(template||"")
    .replace(/\{z\}/g,String(z))
    .replace(/\{x\}/g,String(x))
    .replace(/\{y\}/g,String(y))
    .replace(/\{ratio\}/g,""));
}

function getWeatherbearWaterTileGeometry(z,x,y,signal){
  var zoom=Math.max(0,Math.round(Number(z)||0));
  var n=Math.pow(2,zoom);
  if(!isFinite(x)||!isFinite(y)||y<0||y>=n) return Promise.resolve([]);
  var wrappedX=((Math.round(x)%n)+n)%n;
  var tileY=Math.round(y);
  var key=zoom+"/"+wrappedX+"/"+tileY;
  if(weatherbearWaterTileGeometryCache.has(key)) return weatherbearWaterTileGeometryCache.get(key);

  var promise=Promise.all([loadWeatherbearVectorTileModules(),getWeatherbearBaseWaterTileConfig()]).then(async function(values){
    var modules=values[0],config=values[1];
    var sourceZoom=Math.min(zoom,Math.max(0,Math.round(config.maxzoom||15)));
    var zoomDelta=zoom-sourceZoom;
    var sourceX=wrappedX,sourceY=tileY;
    if(zoomDelta>0){
      var divisor=Math.pow(2,zoomDelta);
      sourceX=Math.floor(wrappedX/divisor);
      sourceY=Math.floor(tileY/divisor);
    }
    var template=config.tiles[Math.abs(sourceX+sourceY)%config.tiles.length];
    var url=buildWeatherbearVectorTileUrl(template,sourceZoom,sourceX,sourceY);
    var options={headers:{Accept:"application/vnd.mapbox-vector-tile,application/x-protobuf"}};
    if(signal) options.signal=signal;
    var response=await fetch(url,options);
    if(response.status===204) return [];
    if(!response.ok) throw new Error("MapTiler water tile "+response.status);
    var arrayBuffer=await response.arrayBuffer();
    var tile=new modules.VectorTile(new modules.Pbf(new Uint8Array(arrayBuffer)));
    var layer=tile&&tile.layers&&tile.layers[config.sourceLayer||"water"];
    if(!layer) return [];
    var output=[];
    for(var i=0;i<layer.length;i++){
      var feature=layer.feature(i);
      if(!feature||feature.type!==3) continue;
      var geometry=feature.loadGeometry();
      if(!geometry||!geometry.length) continue;
      output.push({extent:Number(feature.extent)||4096,rings:geometry.map(function(ring){
        return ring.map(function(point){return [Number(point.x)||0,Number(point.y)||0];});
      }),sourceZoom:sourceZoom,zoomDelta:zoomDelta,childX:zoomDelta>0?wrappedX-sourceX*Math.pow(2,zoomDelta):0,childY:zoomDelta>0?tileY-sourceY*Math.pow(2,zoomDelta):0});
    }
    return output;
  }).catch(function(error){
    weatherbearWaterTileGeometryCache.delete(key);
    throw error;
  });
  weatherbearWaterTileGeometryCache.set(key,promise);
  trimWeatherbearWaterTileCache();
  return promise;
}

function drawWeatherbearWaterGeometry(context,features,offsetX,offsetY,tilePixelSize){
  if(!features||!features.length) return;
  context.fillStyle="#ffffff";
  for(var featureIndex=0;featureIndex<features.length;featureIndex++){
    var feature=features[featureIndex];
    var extent=Math.max(1,feature.extent||4096);
    var zoomDivisor=Math.pow(2,feature.zoomDelta||0);
    var childOffsetX=(feature.childX||0)*extent/zoomDivisor;
    var childOffsetY=(feature.childY||0)*extent/zoomDivisor;
    var childExtent=extent/zoomDivisor;
    var scale=tilePixelSize/Math.max(1,childExtent);
    context.beginPath();
    for(var ringIndex=0;ringIndex<feature.rings.length;ringIndex++){
      var ring=feature.rings[ringIndex];
      if(!ring||ring.length<3) continue;
      for(var pointIndex=0;pointIndex<ring.length;pointIndex++){
        var point=ring[pointIndex];
        var px=offsetX+(point[0]-childOffsetX)*scale;
        var py=offsetY+(point[1]-childOffsetY)*scale;
        if(pointIndex===0) context.moveTo(px,py); else context.lineTo(px,py);
      }
      context.closePath();
    }
    try{context.fill("evenodd");}catch(error){context.fill();}
  }
}

async function buildWeatherbearWaterMask(z,x,y,pad,renderScale,signal){
  var zoom=Math.round(Number(z));
  var tileX=Math.round(Number(x));
  var tileY=Math.round(Number(y));
  var scale=Math.max(1,Math.min(2,Math.round(Number(renderScale)||1)));
  var logicalHalo=Math.max(0,Math.round(Number(pad)||0));
  if(![zoom,tileX,tileY].every(Number.isFinite)) return null;
  var tilePixelSize=256*scale;
  var halo=logicalHalo*scale;
  var size=tilePixelSize+halo*2;
  var canvas=createWeatherbearDepthCanvas(size,size);
  var context=canvas.getContext("2d",{willReadFrequently:true});
  context.clearRect(0,0,size,size);

  var jobs=[];
  for(var dy=-1;dy<=1;dy++){
    for(var dx=-1;dx<=1;dx++){
      (function(tileDx,tileDy){
        jobs.push(getWeatherbearWaterTileGeometry(zoom,tileX+tileDx,tileY+tileDy,signal).then(function(features){
          return {dx:tileDx,dy:tileDy,features:features,failed:false};
        }).catch(function(){return {dx:tileDx,dy:tileDy,features:[],failed:true};}));
      })(dx,dy);
    }
  }
  var tiles=await Promise.all(jobs);
  var centralTile=tiles.find(function(tile){return tile.dx===0&&tile.dy===0;});
  if(!centralTile||centralTile.failed) return null;

  for(var i=0;i<tiles.length;i++){
    var tile=tiles[i];
    if(tile.failed) continue;
    var offsetX=halo+tile.dx*tilePixelSize;
    var offsetY=halo+tile.dy*tilePixelSize;
    drawWeatherbearWaterGeometry(context,tile.features,offsetX,offsetY,tilePixelSize);
  }

  var waterPixels=context.getImageData(0,0,size,size).data;
  var coverage=new Uint8Array(size*size);
  var binary=new Uint8Array(size*size);
  for(var pixel=0;pixel<coverage.length;pixel++){
    var alpha=waterPixels[pixel*4+3];
    coverage[pixel]=alpha;
    // En låg tröskel låter fyllningen nå den antialiasade vattensidan,
    // medan den faktiska alfakanalen fortfarande klipper mjukt exakt vid kusten.
    binary[pixel]=alpha>=32?1:0;
  }
  return {binary:binary,coverage:coverage,width:size,height:size};
}

function applyWeatherbearWaterMask(imageData,waterMaskData){
  var binary=waterMaskData&&waterMaskData.binary?waterMaskData.binary:waterMaskData;
  var coverage=waterMaskData&&waterMaskData.coverage?waterMaskData.coverage:null;
  if(!binary||binary.length!==imageData.width*imageData.height) return false;
  var pixels=imageData.data;
  for(var i=0;i<binary.length;i++){
    var offset=i*4;
    if(!binary[i]){
      pixels[offset]=0;
      pixels[offset+1]=0;
      pixels[offset+2]=0;
      pixels[offset+3]=0;
      continue;
    }
    if(coverage&&coverage.length===binary.length){
      pixels[offset+3]=Math.round(pixels[offset+3]*(coverage[i]/255));
    }
  }
  return true;
}

// Äldre klientgenererade kurvor och kustprofilalgoritmer är borttagna i v15.
// Externa EMODnet WFS-kurvor används nu både som färggränser och synligt kurvlager.

function cropWeatherbearDepthCanvas(canvas,pad,renderScale){
  var target=createWeatherbearDepthCanvas(256,256);
  var context=target.getContext("2d");
  context.imageSmoothingEnabled=true;
  try{context.imageSmoothingQuality="high";}catch(e){}
  var scale=Math.max(1,Math.min(2,Math.round(Number(renderScale)||1)));
  var sourceWidth=Number(canvas&&canvas.width)||256*scale;
  var sourceHeight=Number(canvas&&canvas.height)||256*scale;
  var cropX=Math.max(0,Math.round(Number(pad||0)*scale));
  var cropY=cropX;
  var cropWidth=Math.min(256*scale,sourceWidth-cropX);
  var cropHeight=Math.min(256*scale,sourceHeight-cropY);
  context.clearRect(0,0,256,256);
  context.drawImage(canvas,cropX,cropY,cropWidth,cropHeight,0,0,256,256);
  return target;
}

function buildWeatherbearIntrinsicDepthMask(imageData,type){
  if(!imageData||!imageData.data) return null;
  var count=imageData.width*imageData.height;
  var binary=new Uint8Array(count),coverage=new Uint8Array(count),validCount=0;
  var pixels=imageData.data;
  for(var i=0;i<count;i++){
    var offset=i*4,alpha=Number(pixels[offset+3])||0,valid=false;
    if(type==="contours") valid=alpha>8;
    else valid=decodeWeatherbearDepthSample(pixels[offset],pixels[offset+1],pixels[offset+2],alpha)!=null;
    if(valid){binary[i]=1;coverage[i]=alpha;validCount++;}
  }
  return validCount?{binary:binary,coverage:coverage,width:imageData.width,height:imageData.height,intrinsic:true}:null;
}

function weatherbearMaskHasWater(mask){
  var binary=mask&&mask.binary?mask.binary:mask;
  if(!binary||!binary.length) return false;
  for(var i=0;i<binary.length;i++) if(binary[i]) return true;
  return false;
}

function expandWeatherbearContourBbox(bboxValue,pad){
  var bbox=parseWeatherbearMercatorBbox(bboxValue);
  if(!bbox) return null;
  var safePad=Math.max(0,Math.min(64,Math.round(Number(pad)||0)));
  var pixelWidth=(bbox[2]-bbox[0])/256,pixelHeight=(bbox[3]-bbox[1])/256;
  return [bbox[0]-pixelWidth*safePad,bbox[1]-pixelHeight*safePad,bbox[2]+pixelWidth*safePad,bbox[3]+pixelHeight*safePad];
}

function registerWeatherbearDepthProtocol(){
  if(weatherbearDepthProtocolRegistered) return true;
  if(!window.maptilersdk||typeof maptilersdk.addProtocol!=="function") return false;
  try{
    maptilersdk.addProtocol(weatherbearDepthProtocolName,async function(params,abortController){
      var raw=String(params&&params.url||"").replace(/^weatherbear-depth:\/\//,"");
      var queryIndex=raw.indexOf("?");
      var query=queryIndex>=0?raw.slice(queryIndex+1):"";
      var searchParams=new URLSearchParams(query);
      var zoom=Number(searchParams.get("z"));
      var tileX=Number(searchParams.get("x"));
      var tileY=Number(searchParams.get("y"));
      var bboxValue=searchParams.get("bbox");
      var theme=searchParams.get("theme")==="night"?"night":"day";
      var settings=getWeatherbearDepthGapFillSettings(zoom,bboxValue,"fill");
      settings.tileX=tileX;settings.tileY=tileY;
      var apiParams=new URLSearchParams({
        v:"15",
        z:String(zoom),
        x:String(tileX),
        y:String(tileY),
        bbox:String(bboxValue||""),
        pad:String(settings.pad),
        scale:String(settings.renderScale)
      });
      var signal=abortController&&abortController.signal;
      var fetchOptions={headers:{Accept:"application/json"}};
      if(signal) fetchOptions.signal=signal;
      var contourBbox=expandWeatherbearContourBbox(bboxValue,settings.pad);
      var contourParams=new URLSearchParams({v:"15",bbox:contourBbox?contourBbox.join(","):""});
      var results=await Promise.all([
        fetch("/api/depth-grid?"+apiParams.toString(),fetchOptions),
        buildWeatherbearWaterMask(zoom,tileX,tileY,settings.pad,settings.renderScale,signal).catch(function(error){
          console.warn("Baskartans vattenmask saknas för djup-tile",zoom,tileX,tileY,error);
          return null;
        }),
        fetch("/api/depth-contours?"+contourParams.toString(),fetchOptions).catch(function(error){
          console.warn("EMODnets externa djupkurvor saknas för tile",zoom,tileX,tileY,error);
          return null;
        })
      ]);
      var data=await processWeatherbearRawDepthGrid(results[0],settings,results[1],theme,results[2]);
      return {data:data};
    });
    weatherbearDepthProtocolRegistered=true;
    return true;
  }catch(error){
    console.warn("Weatherbears råa djup-protokoll kunde inte registreras",error);
    return false;
  }
}

function buildWeatherbearDepthTileUrl(theme){
  var renderTheme=theme==="night"?"night":"day";
  return weatherbearDepthProtocolName+"://tile?v=15&type=fill&theme="+renderTheme+"&z={z}&x={x}&y={y}&bbox={bbox-epsg-3857}";
}

function refreshWeatherbearDepthThemeSources(theme){
  if(!maptilerMap) return;
  var renderTheme=theme==="night"?"night":"day";
  if(nauticalDepthTilesTheme===renderTheme) return;
  try{
    var depthSource=maptilerMap.getSource&&maptilerMap.getSource(nauticalDepthSourceId);
    if(depthSource&&typeof depthSource.setTiles==="function") depthSource.setTiles([buildWeatherbearDepthTileUrl(renderTheme)]);
    nauticalDepthTilesTheme=renderTheme;
  }catch(error){console.warn("Kunde inte byta färgtema för djuplagret",error);}
}
function weatherbearLongitudeToMercatorX(longitude){
  return Number(longitude)*20037508.342789244/180;
}
function weatherbearLatitudeToMercatorY(latitude){
  var lat=Math.max(-85.05112878,Math.min(85.05112878,Number(latitude)||0));
  return Math.log(Math.tan((90+lat)*Math.PI/360))*20037508.342789244/Math.PI;
}
async function refreshWeatherbearExternalContourSource(){
  if(!maptilerMap) return;
  var source=maptilerMap.getSource&&maptilerMap.getSource(nauticalDepthContourSourceId);
  if(!source||typeof source.setData!=="function") return;
  var zoom=Number(maptilerMap.getZoom&&maptilerMap.getZoom());
  if(!isFinite(zoom)||zoom<9){source.setData({type:"FeatureCollection",features:[]});return;}
  var bounds=maptilerMap.getBounds&&maptilerMap.getBounds();
  if(!bounds) return;
  var west=Number(bounds.getWest()),south=Number(bounds.getSouth()),east=Number(bounds.getEast()),north=Number(bounds.getNorth());
  if(![west,south,east,north].every(isFinite)) return;
  var minX=weatherbearLongitudeToMercatorX(west),maxX=weatherbearLongitudeToMercatorX(east);
  var minY=weatherbearLatitudeToMercatorY(south),maxY=weatherbearLatitudeToMercatorY(north);
  var marginX=(maxX-minX)*0.16,marginY=(maxY-minY)*0.16;
  var bbox=[minX-marginX,minY-marginY,maxX+marginX,maxY+marginY];
  var requestId=++weatherbearContourViewportRequestId;
  try{
    var params=new URLSearchParams({v:"15",target:"4326",bbox:bbox.join(",")});
    var response=await fetch("/api/depth-contours?"+params.toString(),{headers:{Accept:"application/geo+json, application/json"}});
    if(!response.ok) throw new Error("HTTP "+response.status);
    var data=await response.json();
    if(requestId!==weatherbearContourViewportRequestId) return;
    source=maptilerMap.getSource&&maptilerMap.getSource(nauticalDepthContourSourceId);
    if(source&&typeof source.setData==="function") source.setData(data&&data.type==="FeatureCollection"?data:{type:"FeatureCollection",features:[]});
  }catch(error){
    if(requestId===weatherbearContourViewportRequestId) console.warn("Externa djupkurvor kunde inte uppdateras",error);
  }
}
function scheduleWeatherbearExternalContourRefresh(){
  if(weatherbearContourViewportTimer) clearTimeout(weatherbearContourViewportTimer);
  weatherbearContourViewportTimer=setTimeout(function(){weatherbearContourViewportTimer=null;refreshWeatherbearExternalContourSource();},180);
}
function bindWeatherbearExternalContourUpdates(){
  if(weatherbearContourViewportBound||!maptilerMap||typeof maptilerMap.on!=="function") return;
  weatherbearContourViewportBound=true;
  maptilerMap.on("moveend",scheduleWeatherbearExternalContourRefresh);
  maptilerMap.on("zoomend",scheduleWeatherbearExternalContourRefresh);
}


function firstSymbolLayerId(){
  const style=maptilerMap&&maptilerMap.getStyle&&maptilerMap.getStyle();
  const layer=(style&&Array.isArray(style.layers)?style.layers:[]).find(l=>l.type==="symbol");
  return layer&&layer.id;
}

export function initNauticalDepth(map, apiKey, theme="day"){
  maptilerMap=map;
  MAPTILER_API_KEY=apiKey||"";
  currentTheme=theme==="night"?"night":"day";
  if(!maptilerMap) return false;
  const before=firstSymbolLayerId()||undefined;
  registerWeatherbearDepthProtocol();
  const waterDescriptor=findWeatherbearBaseWaterDescriptor();

  if(!maptilerMap.getSource(nauticalDepthSourceId)){
    maptilerMap.addSource(nauticalDepthSourceId,{type:"raster",tiles:[buildWeatherbearDepthTileUrl(currentTheme)],tileSize:256,minzoom:4,maxzoom:15,bounds:WEATHERBEAR_DEPTH_BOUNDS,attribution:"Djupdata: EMODnet Bathymetry DTM 2024"});
    nauticalDepthTilesTheme=currentTheme;
  }
  if(!maptilerMap.getLayer(nauticalDepthLayerId)) maptilerMap.addLayer({id:nauticalDepthLayerId,type:"raster",source:nauticalDepthSourceId,minzoom:4,maxzoom:22,paint:{"raster-opacity":1,"raster-resampling":"nearest","raster-fade-duration":0}},before);

  if(waterDescriptor&&!maptilerMap.getLayer(nauticalCoastlineLayerId)){
    const layer={id:nauticalCoastlineLayerId,type:"line",source:waterDescriptor.sourceId,"source-layer":waterDescriptor.sourceLayer||"water",minzoom:7,maxzoom:22,layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":currentTheme==="night"?"#806f5f":"#6f8792","line-opacity":0.72,"line-width":["interpolate",["linear"],["zoom"],7,0.35,12,0.55,16,0.9]}};
    if(waterDescriptor.filter) layer.filter=waterDescriptor.filter;
    maptilerMap.addLayer(layer,before);
  }

  if(!maptilerMap.getSource(nauticalDepthContourSourceId)) maptilerMap.addSource(nauticalDepthContourSourceId,{type:"geojson",data:{type:"FeatureCollection",features:[]},attribution:"Djupkurvor: EMODnet Bathymetry"});
  if(!maptilerMap.getLayer(nauticalDepthContourLineLayerId)) maptilerMap.addLayer({id:nauticalDepthContourLineLayerId,type:"line",source:nauticalDepthContourSourceId,minzoom:9,maxzoom:22,filter:["match",["get","depth"],[2,3,6,10,20,50],true,false],layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":currentTheme==="night"?"#c29a70":"#315f78","line-opacity":0.88,"line-width":["interpolate",["linear"],["zoom"],9,0.55,13,0.85,17,1.15]}},before);
  if(!maptilerMap.getLayer(nauticalDepthContourLabelLayerId)) maptilerMap.addLayer({id:nauticalDepthContourLabelLayerId,type:"symbol",source:nauticalDepthContourSourceId,minzoom:10,maxzoom:22,filter:["match",["get","depth"],[2,3,6,10,20,50],true,false],layout:{"symbol-placement":"line","symbol-spacing":["interpolate",["linear"],["zoom"],10,360,14,220,18,150],"text-field":["get","label"],"text-size":["interpolate",["linear"],["zoom"],10,9,15,11],"text-keep-upright":true,"text-rotation-alignment":"map","text-padding":4,"text-allow-overlap":false},paint:{"text-color":currentTheme==="night"?"#e1b382":"#244e66","text-halo-color":currentTheme==="night"?"rgba(7,10,12,.92)":"rgba(255,255,255,.96)","text-halo-width":1.5,"text-halo-blur":0.3}},before);

  if(!maptilerMap.getSource(nauticalSeamarkSourceId)) maptilerMap.addSource(nauticalSeamarkSourceId,{type:"raster",tiles:[NAUTICAL_SEAMARK_TILE_URL],tileSize:256,maxzoom:18,attribution:"© OpenSeaMap contributors"});
  if(!maptilerMap.getLayer(nauticalSeamarkLayerId)) maptilerMap.addLayer({id:nauticalSeamarkLayerId,type:"raster",source:nauticalSeamarkSourceId,paint:{"raster-opacity":currentTheme==="night"?.88:1,"raster-fade-duration":0}});

  bindWeatherbearExternalContourUpdates();
  scheduleWeatherbearExternalContourRefresh();
  return true;
}

export function setNauticalDepthTheme(theme){
  currentTheme=theme==="night"?"night":"day";
  nauticalDepthTilesTheme=null;
  refreshWeatherbearDepthThemeSources(currentTheme);
  if(!maptilerMap) return;
  if(maptilerMap.getLayer(nauticalDepthContourLineLayerId)) maptilerMap.setPaintProperty(nauticalDepthContourLineLayerId,"line-color",currentTheme==="night"?"#c29a70":"#315f78");
  if(maptilerMap.getLayer(nauticalDepthContourLabelLayerId)){
    maptilerMap.setPaintProperty(nauticalDepthContourLabelLayerId,"text-color",currentTheme==="night"?"#e1b382":"#244e66");
    maptilerMap.setPaintProperty(nauticalDepthContourLabelLayerId,"text-halo-color",currentTheme==="night"?"rgba(7,10,12,.92)":"rgba(255,255,255,.96)");
  }
  if(maptilerMap.getLayer(nauticalCoastlineLayerId)) maptilerMap.setPaintProperty(nauticalCoastlineLayerId,"line-color",currentTheme==="night"?"#806f5f":"#6f8792");
  if(maptilerMap.getLayer(nauticalSeamarkLayerId)) maptilerMap.setPaintProperty(nauticalSeamarkLayerId,"raster-opacity",currentTheme==="night"?.88:1);
}
