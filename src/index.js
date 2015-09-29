var L = require('leaflet');
require('leaflet-draw');
require('../lib/L.ImageTransform');

const cartourl = 'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const osmurl = 'http://{s}.tile.osm.org/{z}/{x}/{y}.png';
const stamenurl = 'http://{s}.tile.stamen.com/toner/{z}/{x}/{y}.png';

const osm = new L.TileLayer(stamenurl, {
  maxZoom: 18
});

const map = new L.Map('map', {
  layers: [osm],
  center: new L.LatLng(55.75, 37.63),
  zoom: 9
});

const imageLoader = document.querySelector('.upload');
L.DomEvent.on(imageLoader, 'change', (e) => {
  var reader = new FileReader();
  reader.onload = function(event) {
    var image = new Image();
    image.src = event.target.result;

    console.log(image.width, image.height);
    init(event.target.result, image.width, image.height);
  }
  reader.readAsDataURL(e.target.files[0]);
});

const dropbox = document.querySelector('.drop');
L.DomEvent
  .on(dropbox, "dragenter", L.DomEvent.stop)
  .on(dropbox, "dragover", L.DomEvent.stop)
  .on(dropbox, "drop", (e) => {
    L.DomEvent.stop(e);
    imageLoader.files = e.dataTransfer.files;
  });

function getBounds(center, w, h) {
  let c = map.latLngToLayerPoint(center);

  let nw = map.layerPointToLatLng(c.subtract([w / 2, h / 2]));
  let se = map.layerPointToLatLng(c.add([w / 2, h / 2]));

  return [
    [nw.lat, nw.lng],
    [nw.lat, se.lng],
    [se.lat, se.lng],
    [se.lat, nw.lng]
  ];
}

function init(src, w, h) {
  let anchors = getBounds(map.getCenter(), w, h);
  let clipCoords = getBounds(map.getCenter(), w, h);
  let image = L.imageTransform(src, anchors, {
    opacity: 0.5,
    clip: clipCoords,
    disableSetClip: false
  }).addTo(map);


  let externalPolygon = L.polygon(anchors, {
    fill: false
  }).addTo(map);

  let clipPolygon = L.polygon(clipCoords, {
    fill: false,
    color: 'red'
  }).addTo(map);

  if (!image.options.disableSetClip) {
    clipPolygon.editing.enable();

    clipPolygon.on('edit', function() {
      image.setClip(clipPolygon.getLatLngs());
    });
  }

  L.DomEvent.on(document.querySelector('.opacity'), 'input', (e) => {
    image.options.opacity = this.value;
    image._updateOpacity();
  });

  function updateAnchors() {
    let anchors = anchorMarkers.map((marker) => {
      var ll = marker.getLatLng();
      return ll;
    });
    image.setAnchors(anchors);
    externalPolygon.setLatLngs(anchors);
    clipPolygon.setLatLngs(image.getClip());

    //TODO: support setLatLngs() Leaflet.Draw
    //HACK: update editing points
    if (!image.options.disableSetClip) {
      clipPolygon.editing.disable();
      clipPolygon.editing.enable();
    }
  }

  let anchorMarkers = anchors.map((anchor) => {
    return L.marker(anchor, {
      draggable: true
    }).addTo(map).on('drag', updateAnchors);
  });
}
