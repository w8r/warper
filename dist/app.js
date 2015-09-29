(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

L.ImageTransform = L.ImageOverlay.extend({
  initialize: function initialize(url, anchors, options) {
    // (String, LatLngBounds, Object)
    L.ImageOverlay.prototype.initialize.call(this, url, anchors, options);
    this.setAnchors(anchors);
  },

  setAnchors: function setAnchors(anchors) {
    this._anchors = [];
    this._bounds = L.latLngBounds(anchors);
    for (var i = 0, len = anchors.length; i < len; i++) {
      var yx = anchors[i];
      this._anchors.push(L.latLng(yx));
    }

    if (this._map) {
      this._reset();
    }
  },

  _latLngToLayerPoint: function _latLngToLayerPoint(latlng) {
    return this._map.project(latlng)._subtract(this._map.getPixelOrigin());
  },

  setClip: function setClip(clipLatLngs) {
    var topLeft = this._latLngToLayerPoint(this._bounds.getNorthWest()),
        pixelClipPoints = [];

    this.options.clip = clipLatLngs;

    for (var p = 0; p < clipLatLngs.length; p++) {
      var mercPoint = this._latLngToLayerPoint(clipLatLngs[p]),
          pixel = L.ImageTransform.Utils.project(this._matrix3d_inverse, mercPoint.x - topLeft.x, mercPoint.y - topLeft.y);
      pixelClipPoints.push(L.point(pixel[0], pixel[1]));
    }

    this.setClipPixels(pixelClipPoints);
  },

  setClipPixels: function setClipPixels(pixelClipPoints) {
    this._clipDone = false;
    this._pixelClipPoints = pixelClipPoints;
    this._drawCanvas();
  },

  setUrl: function setUrl(url) {
    this._url = url;
    this._imgNode.src = this._url;
  },

  getClip: function getClip() {
    return this.options.clip;
  },

  _imgLoaded: false,
  _initImage: function _initImage() {
    this._image = L.DomUtil.create('div', 'leaflet-image-layer');

    if (this._map.options.zoomAnimation && L.Browser.any3d) {
      L.DomUtil.addClass(this._image, 'leaflet-zoom-animated');
    } else {
      L.DomUtil.addClass(this._image, 'leaflet-zoom-hide');
    }

    this._imgNode = L.DomUtil.create('img');
    if (this.options.clip) {
      this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-transform');
      this._image.appendChild(this._canvas);
      this._canvas.style[L.DomUtil.TRANSFORM_ORIGIN] = '0 0';
      this._clipDone = false;
    } else {
      this._image.appendChild(this._imgNode);
      this._imgNode.style[L.DomUtil.TRANSFORM_ORIGIN] = '0 0';

      // Hide imgNode until image has loaded
      this._imgNode.style.display = 'none';
    }

    this._updateOpacity();

    //TODO createImage util method to remove duplication
    this._imgLoaded = false;
    L.extend(this._imgNode, {
      galleryimg: 'no',
      onselectstart: L.Util.falseFn,
      onmousemove: L.Util.falseFn,
      onload: L.bind(this._onImageLoad, this),
      onerror: L.bind(this._onImageError, this),
      src: this._url
    });
  },

  _onImageError: function _onImageError() {
    this.fire('error');
  },

  _onImageLoad: function _onImageLoad() {
    if (this.options.clip) {
      this._canvas.width = this._imgNode.width;
      this._canvas.height = this._imgNode.height;
    } else {
      // Show imgNode once image has loaded
      this._imgNode.style.display = 'inherit';
    }
    this._imgLoaded = true;

    this._reset();
    this.fire('load');
  },

  _reset: function _reset() {
    if (this.options.clip && !this._imgLoaded) {
      return;
    }
    var div = this._image,
        imgNode = this.options.clip ? this._canvas : this._imgNode,
        topLeft = this._latLngToLayerPoint(this._bounds.getNorthWest()),
        size = this._latLngToLayerPoint(this._bounds.getSouthEast())._subtract(topLeft),
        anchors = this._anchors,
        w = imgNode.width,
        h = imgNode.height,
        pixels = [],
        i,
        len,
        p;

    for (i = 0, len = anchors.length; i < len; i++) {
      p = this._latLngToLayerPoint(anchors[i]);
      pixels.push(L.point(p.x - topLeft.x, p.y - topLeft.y));
    }

    L.DomUtil.setPosition(div, topLeft);

    div.style.width = size.x + 'px';
    div.style.height = size.y + 'px';

    var matrix3d = this._matrix3d = L.ImageTransform.Utils.general2DProjection(0, 0, pixels[0].x, pixels[0].y, w, 0, pixels[1].x, pixels[1].y, w, h, pixels[2].x, pixels[2].y, 0, h, pixels[3].x, pixels[3].y);

    //something went wrong (for example, target image size is less then one pixel)
    if (!matrix3d[8]) {
      return;
    }

    //matrix normalization
    for (i = 0; i !== 9; ++i) {
      matrix3d[i] = matrix3d[i] / matrix3d[8];
    }

    this._matrix3d_inverse = L.ImageTransform.Utils.adj(matrix3d);

    imgNode.style[L.DomUtil.TRANSFORM] = this._getMatrix3dCSS(this._matrix3d);
    if (this.options.clip) {
      if (this._pixelClipPoints) {
        this.options.clip = [];
        for (p = 0; p < this._pixelClipPoints.length; p++) {
          var mercPoint = L.ImageTransform.Utils.project(matrix3d, this._pixelClipPoints[p].x, this._pixelClipPoints[p].y);
          this.options.clip.push(this._map.layerPointToLatLng(L.point(mercPoint[0] + topLeft.x, mercPoint[1] + topLeft.y)));
        }

        this._drawCanvas();
      } else {
        this.setClip(this.options.clip);
      }
    }
  },

  _getMatrix3dCSS: function _getMatrix3dCSS(arr) {
    // get CSS atribute matrix3d
    var css = 'matrix3d(';
    css += arr[0].toFixed(9) + ',' + arr[3].toFixed(9) + ', 0,' + arr[6].toFixed(9);
    css += ',' + arr[1].toFixed(9) + ',' + arr[4].toFixed(9) + ', 0,' + arr[7].toFixed(9);
    css += ',0, 0, 1, 0';
    css += ',' + arr[2].toFixed(9) + ',' + arr[5].toFixed(9) + ', 0, ' + arr[8].toFixed(9) + ')';
    return css;
  },

  _clipDone: false,
  _drawCanvas: function _drawCanvas() {
    if (!this._clipDone && this._imgNode) {
      var canvas = this._canvas,
          ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = ctx.createPattern(this._imgNode, 'no-repeat');

      ctx.beginPath();
      for (var i = 0, len = this._pixelClipPoints.length; i < len; i++) {
        var pix = this._pixelClipPoints[i];
        ctx[i ? 'lineTo' : 'moveTo'](pix.x, pix.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = null;
      if (this.options.disableSetClip) {
        this._imgNode = null;
      }
      this._clipDone = true;
    }
  }
});

L.imageTransform = function (url, bounds, options) {
  return new L.ImageTransform(url, bounds, options);
};

L.DomUtil.TRANSFORM_ORIGIN = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'OTransformOrigin', 'MozTransformOrigin', 'msTransformOrigin']);

//Based on http://math.stackexchange.com/questions/296794/finding-the-transform-matrix-from-4-projected-points-with-javascript
(function () {
  function adj(m) {
    // Compute the adjugate of m
    return [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
  }

  function multmm(a, b) {
    // multiply two matrices
    var c = Array(9);
    for (var i = 0; i !== 3; ++i) {
      for (var j = 0; j !== 3; ++j) {
        var cij = 0;
        for (var k = 0; k !== 3; ++k) {
          cij += a[3 * i + k] * b[3 * k + j];
        }
        c[3 * i + j] = cij;
      }
    }
    return c;
  }

  function multmv(m, v) {
    // multiply matrix and vector
    return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  }

  function basisToPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
    var m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
    var v = multmv(adj(m), [x4, y4, 1]);
    return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
  }

  L.ImageTransform.Utils = {
    general2DProjection: function general2DProjection(x1s, y1s, x1d, y1d, x2s, y2s, x2d, y2d, x3s, y3s, x3d, y3d, x4s, y4s, x4d, y4d) {
      var s = basisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
      var d = basisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
      return multmm(d, adj(s));
    },

    project: function project(m, x, y) {
      var v = multmv(m, [x, y, 1]);
      return [v[0] / v[2], v[1] / v[2]];
    },
    adj: adj
  };
})();

},{}],2:[function(require,module,exports){
/*
	Leaflet.draw, a plugin that adds drawing and editing tools to Leaflet powered maps.
	(c) 2012-2013, Jacob Toye, Smartrak

	https://github.com/Leaflet/Leaflet.draw
	http://leafletjs.com
	https://github.com/jacobtoye
*/
!function(t,e){L.drawVersion="0.2.4-dev",L.drawLocal={draw:{toolbar:{actions:{title:"Cancel drawing",text:"Cancel"},undo:{title:"Delete last point drawn",text:"Delete last point"},buttons:{polyline:"Draw a polyline",polygon:"Draw a polygon",rectangle:"Draw a rectangle",circle:"Draw a circle",marker:"Draw a marker"}},handlers:{circle:{tooltip:{start:"Click and drag to draw circle."}},marker:{tooltip:{start:"Click map to place marker."}},polygon:{tooltip:{start:"Click to start drawing shape.",cont:"Click to continue drawing shape.",end:"Click first point to close this shape."}},polyline:{error:"<strong>Error:</strong> shape edges cannot cross!",tooltip:{start:"Click to start drawing line.",cont:"Click to continue drawing line.",end:"Click last point to finish line."}},rectangle:{tooltip:{start:"Click and drag to draw rectangle."}},simpleshape:{tooltip:{end:"Release mouse to finish drawing."}}}},edit:{toolbar:{actions:{save:{title:"Save changes.",text:"Save"},cancel:{title:"Cancel editing, discards all changes.",text:"Cancel"}},buttons:{edit:"Edit layers.",editDisabled:"No layers to edit.",remove:"Delete layers.",removeDisabled:"No layers to delete."}},handlers:{edit:{tooltip:{text:"Drag handles, or marker to edit feature.",subtext:"Click cancel to undo changes."}},remove:{tooltip:{text:"Click on a feature to remove"}}}}},L.Draw={},L.Draw.Feature=L.Handler.extend({includes:L.Mixin.Events,initialize:function(t,e){this._map=t,this._container=t._container,this._overlayPane=t._panes.overlayPane,this._popupPane=t._panes.popupPane,e&&e.shapeOptions&&(e.shapeOptions=L.Util.extend({},this.options.shapeOptions,e.shapeOptions)),L.setOptions(this,e)},enable:function(){this._enabled||(this.fire("enabled",{handler:this.type}),this._map.fire("draw:drawstart",{layerType:this.type}),L.Handler.prototype.enable.call(this))},disable:function(){this._enabled&&(L.Handler.prototype.disable.call(this),this._map.fire("draw:drawstop",{layerType:this.type}),this.fire("disabled",{handler:this.type}))},addHooks:function(){var t=this._map;t&&(L.DomUtil.disableTextSelection(),t.getContainer().focus(),this._tooltip=new L.Tooltip(this._map),L.DomEvent.on(this._container,"keyup",this._cancelDrawing,this))},removeHooks:function(){this._map&&(L.DomUtil.enableTextSelection(),this._tooltip.dispose(),this._tooltip=null,L.DomEvent.off(this._container,"keyup",this._cancelDrawing,this))},setOptions:function(t){L.setOptions(this,t)},_fireCreatedEvent:function(t){this._map.fire("draw:created",{layer:t,layerType:this.type})},_cancelDrawing:function(t){27===t.keyCode&&this.disable()}}),L.Draw.Polyline=L.Draw.Feature.extend({statics:{TYPE:"polyline"},Poly:L.Polyline,options:{allowIntersection:!0,repeatMode:!1,drawError:{color:"#b00b00",timeout:2500},icon:new L.DivIcon({iconSize:new L.Point(8,8),className:"leaflet-div-icon leaflet-editing-icon"}),guidelineDistance:20,maxGuideLineLength:4e3,shapeOptions:{stroke:!0,color:"#f06eaa",weight:4,opacity:.5,fill:!1,clickable:!0},metric:!0,showLength:!0,zIndexOffset:2e3},initialize:function(t,e){this.options.drawError.message=L.drawLocal.draw.handlers.polyline.error,e&&e.drawError&&(e.drawError=L.Util.extend({},this.options.drawError,e.drawError)),this.type=L.Draw.Polyline.TYPE,L.Draw.Feature.prototype.initialize.call(this,t,e)},addHooks:function(){L.Draw.Feature.prototype.addHooks.call(this),this._map&&(this._markers=[],this._markerGroup=new L.LayerGroup,this._map.addLayer(this._markerGroup),this._poly=new L.Polyline([],this.options.shapeOptions),this._tooltip.updateContent(this._getTooltipText()),this._mouseMarker||(this._mouseMarker=L.marker(this._map.getCenter(),{icon:L.divIcon({className:"leaflet-mouse-marker",iconAnchor:[20,20],iconSize:[40,40]}),opacity:0,zIndexOffset:this.options.zIndexOffset})),this._mouseMarker.on("mousedown",this._onMouseDown,this).addTo(this._map),this._map.on("mousemove",this._onMouseMove,this).on("mouseup",this._onMouseUp,this).on("zoomend",this._onZoomEnd,this))},removeHooks:function(){L.Draw.Feature.prototype.removeHooks.call(this),this._clearHideErrorTimeout(),this._cleanUpShape(),this._map.removeLayer(this._markerGroup),delete this._markerGroup,delete this._markers,this._map.removeLayer(this._poly),delete this._poly,this._mouseMarker.off("mousedown",this._onMouseDown,this).off("mouseup",this._onMouseUp,this),this._map.removeLayer(this._mouseMarker),delete this._mouseMarker,this._clearGuides(),this._map.off("mousemove",this._onMouseMove,this).off("zoomend",this._onZoomEnd,this)},deleteLastVertex:function(){if(!(this._markers.length<=1)){var t=this._markers.pop(),e=this._poly,i=this._poly.spliceLatLngs(e.getLatLngs().length-1,1)[0];this._markerGroup.removeLayer(t),e.getLatLngs().length<2&&this._map.removeLayer(e),this._vertexChanged(i,!1)}},addVertex:function(t){var e=this._markers.length;return e>0&&!this.options.allowIntersection&&this._poly.newLatLngIntersects(t)?(this._showErrorTooltip(),void 0):(this._errorShown&&this._hideErrorTooltip(),this._markers.push(this._createMarker(t)),this._poly.addLatLng(t),2===this._poly.getLatLngs().length&&this._map.addLayer(this._poly),this._vertexChanged(t,!0),void 0)},_finishShape:function(){var t=this._poly.newLatLngIntersects(this._poly.getLatLngs()[0],!0);return!this.options.allowIntersection&&t||!this._shapeIsValid()?(this._showErrorTooltip(),void 0):(this._fireCreatedEvent(),this.disable(),this.options.repeatMode&&this.enable(),void 0)},_shapeIsValid:function(){return!0},_onZoomEnd:function(){this._updateGuide()},_onMouseMove:function(t){var e=t.layerPoint,i=t.latlng;this._currentLatLng=i,this._updateTooltip(i),this._updateGuide(e),this._mouseMarker.setLatLng(i),L.DomEvent.preventDefault(t.originalEvent)},_vertexChanged:function(t,e){this._updateFinishHandler(),this._updateRunningMeasure(t,e),this._clearGuides(),this._updateTooltip()},_onMouseDown:function(t){var e=t.originalEvent;this._mouseDownOrigin=L.point(e.clientX,e.clientY)},_onMouseUp:function(e){if(this._mouseDownOrigin){var i=L.point(e.originalEvent.clientX,e.originalEvent.clientY).distanceTo(this._mouseDownOrigin);Math.abs(i)<9*(t.devicePixelRatio||1)&&this.addVertex(e.latlng)}this._mouseDownOrigin=null},_updateFinishHandler:function(){var t=this._markers.length;t>1&&this._markers[t-1].on("click",this._finishShape,this),t>2&&this._markers[t-2].off("click",this._finishShape,this)},_createMarker:function(t){var e=new L.Marker(t,{icon:this.options.icon,zIndexOffset:2*this.options.zIndexOffset});return this._markerGroup.addLayer(e),e},_updateGuide:function(t){var e=this._markers.length;e>0&&(t=t||this._map.latLngToLayerPoint(this._currentLatLng),this._clearGuides(),this._drawGuide(this._map.latLngToLayerPoint(this._markers[e-1].getLatLng()),t))},_updateTooltip:function(t){var e=this._getTooltipText();t&&this._tooltip.updatePosition(t),this._errorShown||this._tooltip.updateContent(e)},_drawGuide:function(t,e){var i,o,a,s=Math.floor(Math.sqrt(Math.pow(e.x-t.x,2)+Math.pow(e.y-t.y,2))),r=this.options.guidelineDistance,n=this.options.maxGuideLineLength,l=s>n?s-n:r;for(this._guidesContainer||(this._guidesContainer=L.DomUtil.create("div","leaflet-draw-guides",this._overlayPane));s>l;l+=this.options.guidelineDistance)i=l/s,o={x:Math.floor(t.x*(1-i)+i*e.x),y:Math.floor(t.y*(1-i)+i*e.y)},a=L.DomUtil.create("div","leaflet-draw-guide-dash",this._guidesContainer),a.style.backgroundColor=this._errorShown?this.options.drawError.color:this.options.shapeOptions.color,L.DomUtil.setPosition(a,o)},_updateGuideColor:function(t){if(this._guidesContainer)for(var e=0,i=this._guidesContainer.childNodes.length;i>e;e++)this._guidesContainer.childNodes[e].style.backgroundColor=t},_clearGuides:function(){if(this._guidesContainer)for(;this._guidesContainer.firstChild;)this._guidesContainer.removeChild(this._guidesContainer.firstChild)},_getTooltipText:function(){var t,e,i=this.options.showLength;return 0===this._markers.length?t={text:L.drawLocal.draw.handlers.polyline.tooltip.start}:(e=i?this._getMeasurementString():"",t=1===this._markers.length?{text:L.drawLocal.draw.handlers.polyline.tooltip.cont,subtext:e}:{text:L.drawLocal.draw.handlers.polyline.tooltip.end,subtext:e}),t},_updateRunningMeasure:function(t,e){var i,o,a=this._markers.length;1===this._markers.length?this._measurementRunningTotal=0:(i=a-(e?2:1),o=t.distanceTo(this._markers[i].getLatLng()),this._measurementRunningTotal+=o*(e?1:-1))},_getMeasurementString:function(){var t,e=this._currentLatLng,i=this._markers[this._markers.length-1].getLatLng();return t=this._measurementRunningTotal+e.distanceTo(i),L.GeometryUtil.readableDistance(t,this.options.metric)},_showErrorTooltip:function(){this._errorShown=!0,this._tooltip.showAsError().updateContent({text:this.options.drawError.message}),this._updateGuideColor(this.options.drawError.color),this._poly.setStyle({color:this.options.drawError.color}),this._clearHideErrorTimeout(),this._hideErrorTimeout=setTimeout(L.Util.bind(this._hideErrorTooltip,this),this.options.drawError.timeout)},_hideErrorTooltip:function(){this._errorShown=!1,this._clearHideErrorTimeout(),this._tooltip.removeError().updateContent(this._getTooltipText()),this._updateGuideColor(this.options.shapeOptions.color),this._poly.setStyle({color:this.options.shapeOptions.color})},_clearHideErrorTimeout:function(){this._hideErrorTimeout&&(clearTimeout(this._hideErrorTimeout),this._hideErrorTimeout=null)},_cleanUpShape:function(){this._markers.length>1&&this._markers[this._markers.length-1].off("click",this._finishShape,this)},_fireCreatedEvent:function(){var t=new this.Poly(this._poly.getLatLngs(),this.options.shapeOptions);L.Draw.Feature.prototype._fireCreatedEvent.call(this,t)}}),L.Draw.Polygon=L.Draw.Polyline.extend({statics:{TYPE:"polygon"},Poly:L.Polygon,options:{showArea:!1,shapeOptions:{stroke:!0,color:"#f06eaa",weight:4,opacity:.5,fill:!0,fillColor:null,fillOpacity:.2,clickable:!0}},initialize:function(t,e){L.Draw.Polyline.prototype.initialize.call(this,t,e),this.type=L.Draw.Polygon.TYPE},_updateFinishHandler:function(){var t=this._markers.length;1===t&&this._markers[0].on("click",this._finishShape,this),t>2&&(this._markers[t-1].on("dblclick",this._finishShape,this),t>3&&this._markers[t-2].off("dblclick",this._finishShape,this))},_getTooltipText:function(){var t,e;return 0===this._markers.length?t=L.drawLocal.draw.handlers.polygon.tooltip.start:this._markers.length<3?t=L.drawLocal.draw.handlers.polygon.tooltip.cont:(t=L.drawLocal.draw.handlers.polygon.tooltip.end,e=this._getMeasurementString()),{text:t,subtext:e}},_getMeasurementString:function(){var t=this._area;return t?L.GeometryUtil.readableArea(t,this.options.metric):null},_shapeIsValid:function(){return this._markers.length>=3},_vertexChanged:function(t,e){var i;!this.options.allowIntersection&&this.options.showArea&&(i=this._poly.getLatLngs(),this._area=L.GeometryUtil.geodesicArea(i)),L.Draw.Polyline.prototype._vertexChanged.call(this,t,e)},_cleanUpShape:function(){var t=this._markers.length;t>0&&(this._markers[0].off("click",this._finishShape,this),t>2&&this._markers[t-1].off("dblclick",this._finishShape,this))}}),L.SimpleShape={},L.Draw.SimpleShape=L.Draw.Feature.extend({options:{repeatMode:!1},initialize:function(t,e){this._endLabelText=L.drawLocal.draw.handlers.simpleshape.tooltip.end,L.Draw.Feature.prototype.initialize.call(this,t,e)},addHooks:function(){L.Draw.Feature.prototype.addHooks.call(this),this._map&&(this._mapDraggable=this._map.dragging.enabled(),this._mapDraggable&&this._map.dragging.disable(),this._container.style.cursor="crosshair",this._tooltip.updateContent({text:this._initialLabelText}),this._map.on("mousedown",this._onMouseDown,this).on("mousemove",this._onMouseMove,this))},removeHooks:function(){L.Draw.Feature.prototype.removeHooks.call(this),this._map&&(this._mapDraggable&&this._map.dragging.enable(),this._container.style.cursor="",this._map.off("mousedown",this._onMouseDown,this).off("mousemove",this._onMouseMove,this),L.DomEvent.off(e,"mouseup",this._onMouseUp,this),this._shape&&(this._map.removeLayer(this._shape),delete this._shape)),this._isDrawing=!1},_onMouseDown:function(t){this._isDrawing=!0,this._startLatLng=t.latlng,L.DomEvent.on(e,"mouseup",this._onMouseUp,this).preventDefault(t.originalEvent)},_onMouseMove:function(t){var e=t.latlng;this._tooltip.updatePosition(e),this._isDrawing&&(this._tooltip.updateContent({text:this._endLabelText}),this._drawShape(e))},_onMouseUp:function(){this._shape&&this._fireCreatedEvent(),this.disable(),this.options.repeatMode&&this.enable()}}),L.Draw.Rectangle=L.Draw.SimpleShape.extend({statics:{TYPE:"rectangle"},options:{shapeOptions:{stroke:!0,color:"#f06eaa",weight:4,opacity:.5,fill:!0,fillColor:null,fillOpacity:.2,clickable:!0}},initialize:function(t,e){this.type=L.Draw.Rectangle.TYPE,this._initialLabelText=L.drawLocal.draw.handlers.rectangle.tooltip.start,L.Draw.SimpleShape.prototype.initialize.call(this,t,e)},_drawShape:function(t){this._shape?this._shape.setBounds(new L.LatLngBounds(this._startLatLng,t)):(this._shape=new L.Rectangle(new L.LatLngBounds(this._startLatLng,t),this.options.shapeOptions),this._map.addLayer(this._shape))},_fireCreatedEvent:function(){var t=new L.Rectangle(this._shape.getBounds(),this.options.shapeOptions);L.Draw.SimpleShape.prototype._fireCreatedEvent.call(this,t)}}),L.Draw.Circle=L.Draw.SimpleShape.extend({statics:{TYPE:"circle"},options:{shapeOptions:{stroke:!0,color:"#f06eaa",weight:4,opacity:.5,fill:!0,fillColor:null,fillOpacity:.2,clickable:!0},showRadius:!0,metric:!0},initialize:function(t,e){this.type=L.Draw.Circle.TYPE,this._initialLabelText=L.drawLocal.draw.handlers.circle.tooltip.start,L.Draw.SimpleShape.prototype.initialize.call(this,t,e)},_drawShape:function(t){this._shape?this._shape.setRadius(this._startLatLng.distanceTo(t)):(this._shape=new L.Circle(this._startLatLng,this._startLatLng.distanceTo(t),this.options.shapeOptions),this._map.addLayer(this._shape))},_fireCreatedEvent:function(){var t=new L.Circle(this._startLatLng,this._shape.getRadius(),this.options.shapeOptions);L.Draw.SimpleShape.prototype._fireCreatedEvent.call(this,t)},_onMouseMove:function(t){var e,i=t.latlng,o=this.options.showRadius,a=this.options.metric;this._tooltip.updatePosition(i),this._isDrawing&&(this._drawShape(i),e=this._shape.getRadius().toFixed(1),this._tooltip.updateContent({text:this._endLabelText,subtext:o?"Radius: "+L.GeometryUtil.readableDistance(e,a):""}))}}),L.Draw.Marker=L.Draw.Feature.extend({statics:{TYPE:"marker"},options:{icon:new L.Icon.Default,repeatMode:!1,zIndexOffset:2e3},initialize:function(t,e){this.type=L.Draw.Marker.TYPE,L.Draw.Feature.prototype.initialize.call(this,t,e)},addHooks:function(){L.Draw.Feature.prototype.addHooks.call(this),this._map&&(this._tooltip.updateContent({text:L.drawLocal.draw.handlers.marker.tooltip.start}),this._mouseMarker||(this._mouseMarker=L.marker(this._map.getCenter(),{icon:L.divIcon({className:"leaflet-mouse-marker",iconAnchor:[20,20],iconSize:[40,40]}),opacity:0,zIndexOffset:this.options.zIndexOffset})),this._mouseMarker.on("click",this._onClick,this).addTo(this._map),this._map.on("mousemove",this._onMouseMove,this))},removeHooks:function(){L.Draw.Feature.prototype.removeHooks.call(this),this._map&&(this._marker&&(this._marker.off("click",this._onClick,this),this._map.off("click",this._onClick,this).removeLayer(this._marker),delete this._marker),this._mouseMarker.off("click",this._onClick,this),this._map.removeLayer(this._mouseMarker),delete this._mouseMarker,this._map.off("mousemove",this._onMouseMove,this))},_onMouseMove:function(t){var e=t.latlng;this._tooltip.updatePosition(e),this._mouseMarker.setLatLng(e),this._marker?(e=this._mouseMarker.getLatLng(),this._marker.setLatLng(e)):(this._marker=new L.Marker(e,{icon:this.options.icon,zIndexOffset:this.options.zIndexOffset}),this._marker.on("click",this._onClick,this),this._map.on("click",this._onClick,this).addLayer(this._marker))},_onClick:function(){this._fireCreatedEvent(),this.disable(),this.options.repeatMode&&this.enable()},_fireCreatedEvent:function(){var t=new L.Marker(this._marker.getLatLng(),{icon:this.options.icon});L.Draw.Feature.prototype._fireCreatedEvent.call(this,t)}}),L.Edit=L.Edit||{},L.Edit.Poly=L.Handler.extend({options:{icon:new L.DivIcon({iconSize:new L.Point(8,8),className:"leaflet-div-icon leaflet-editing-icon"})},initialize:function(t,e){this._poly=t,L.setOptions(this,e)},addHooks:function(){this._poly._map&&(this._markerGroup||this._initMarkers(),this._poly._map.addLayer(this._markerGroup))},removeHooks:function(){this._poly._map&&(this._poly._map.removeLayer(this._markerGroup),delete this._markerGroup,delete this._markers)},updateMarkers:function(){this._markerGroup.clearLayers(),this._initMarkers()},_initMarkers:function(){this._markerGroup||(this._markerGroup=new L.LayerGroup),this._markers=[];var t,e,i,o,a=this._poly._latlngs;for(t=0,i=a.length;i>t;t++)o=this._createMarker(a[t],t),o.on("click",this._onMarkerClick,this),this._markers.push(o);var s,r;for(t=0,e=i-1;i>t;e=t++)(0!==t||L.Polygon&&this._poly instanceof L.Polygon)&&(s=this._markers[e],r=this._markers[t],this._createMiddleMarker(s,r),this._updatePrevNext(s,r))},_createMarker:function(t,e){var i=new L.Marker(t,{draggable:!0,icon:this.options.icon});return i._origLatLng=t,i._index=e,i.on("drag",this._onMarkerDrag,this),i.on("dragend",this._fireEdit,this),this._markerGroup.addLayer(i),i},_removeMarker:function(t){var e=t._index;this._markerGroup.removeLayer(t),this._markers.splice(e,1),this._poly.spliceLatLngs(e,1),this._updateIndexes(e,-1),t.off("drag",this._onMarkerDrag,this).off("dragend",this._fireEdit,this).off("click",this._onMarkerClick,this)},_fireEdit:function(){this._poly.edited=!0,this._poly.fire("edit")},_onMarkerDrag:function(t){var e=t.target;L.extend(e._origLatLng,e._latlng),e._middleLeft&&e._middleLeft.setLatLng(this._getMiddleLatLng(e._prev,e)),e._middleRight&&e._middleRight.setLatLng(this._getMiddleLatLng(e,e._next)),this._poly.redraw()},_onMarkerClick:function(t){var e=L.Polygon&&this._poly instanceof L.Polygon?4:3,i=t.target;this._poly._latlngs.length<e||(this._removeMarker(i),this._updatePrevNext(i._prev,i._next),i._middleLeft&&this._markerGroup.removeLayer(i._middleLeft),i._middleRight&&this._markerGroup.removeLayer(i._middleRight),i._prev&&i._next?this._createMiddleMarker(i._prev,i._next):i._prev?i._next||(i._prev._middleRight=null):i._next._middleLeft=null,this._fireEdit())},_updateIndexes:function(t,e){this._markerGroup.eachLayer(function(i){i._index>t&&(i._index+=e)})},_createMiddleMarker:function(t,e){var i,o,a,s=this._getMiddleLatLng(t,e),r=this._createMarker(s);r.setOpacity(.6),t._middleRight=e._middleLeft=r,o=function(){var o=e._index;r._index=o,r.off("click",i,this).on("click",this._onMarkerClick,this),s.lat=r.getLatLng().lat,s.lng=r.getLatLng().lng,this._poly.spliceLatLngs(o,0,s),this._markers.splice(o,0,r),r.setOpacity(1),this._updateIndexes(o,1),e._index++,this._updatePrevNext(t,r),this._updatePrevNext(r,e),this._poly.fire("editstart")},a=function(){r.off("dragstart",o,this),r.off("dragend",a,this),this._createMiddleMarker(t,r),this._createMiddleMarker(r,e)},i=function(){o.call(this),a.call(this),this._fireEdit()},r.on("click",i,this).on("dragstart",o,this).on("dragend",a,this),this._markerGroup.addLayer(r)},_updatePrevNext:function(t,e){t&&(t._next=e),e&&(e._prev=t)},_getMiddleLatLng:function(t,e){var i=this._poly._map,o=i.project(t.getLatLng()),a=i.project(e.getLatLng());return i.unproject(o._add(a)._divideBy(2))}}),L.Polyline.addInitHook(function(){this.editing||(L.Edit.Poly&&(this.editing=new L.Edit.Poly(this),this.options.editable&&this.editing.enable()),this.on("add",function(){this.editing&&this.editing.enabled()&&this.editing.addHooks()}),this.on("remove",function(){this.editing&&this.editing.enabled()&&this.editing.removeHooks()}))}),L.Edit=L.Edit||{},L.Edit.SimpleShape=L.Handler.extend({options:{moveIcon:new L.DivIcon({iconSize:new L.Point(8,8),className:"leaflet-div-icon leaflet-editing-icon leaflet-edit-move"}),resizeIcon:new L.DivIcon({iconSize:new L.Point(8,8),className:"leaflet-div-icon leaflet-editing-icon leaflet-edit-resize"})},initialize:function(t,e){this._shape=t,L.Util.setOptions(this,e)},addHooks:function(){this._shape._map&&(this._map=this._shape._map,this._markerGroup||this._initMarkers(),this._map.addLayer(this._markerGroup))},removeHooks:function(){if(this._shape._map){this._unbindMarker(this._moveMarker);for(var t=0,e=this._resizeMarkers.length;e>t;t++)this._unbindMarker(this._resizeMarkers[t]);this._resizeMarkers=null,this._map.removeLayer(this._markerGroup),delete this._markerGroup}this._map=null},updateMarkers:function(){this._markerGroup.clearLayers(),this._initMarkers()},_initMarkers:function(){this._markerGroup||(this._markerGroup=new L.LayerGroup),this._createMoveMarker(),this._createResizeMarker()},_createMoveMarker:function(){},_createResizeMarker:function(){},_createMarker:function(t,e){var i=new L.Marker(t,{draggable:!0,icon:e,zIndexOffset:10});return this._bindMarker(i),this._markerGroup.addLayer(i),i},_bindMarker:function(t){t.on("dragstart",this._onMarkerDragStart,this).on("drag",this._onMarkerDrag,this).on("dragend",this._onMarkerDragEnd,this)},_unbindMarker:function(t){t.off("dragstart",this._onMarkerDragStart,this).off("drag",this._onMarkerDrag,this).off("dragend",this._onMarkerDragEnd,this)},_onMarkerDragStart:function(t){var e=t.target;e.setOpacity(0),this._shape.fire("editstart")},_fireEdit:function(){this._shape.edited=!0,this._shape.fire("edit")},_onMarkerDrag:function(t){var e=t.target,i=e.getLatLng();e===this._moveMarker?this._move(i):this._resize(i),this._shape.redraw()},_onMarkerDragEnd:function(t){var e=t.target;e.setOpacity(1),this._fireEdit()},_move:function(){},_resize:function(){}}),L.Edit=L.Edit||{},L.Edit.Rectangle=L.Edit.SimpleShape.extend({_createMoveMarker:function(){var t=this._shape.getBounds(),e=t.getCenter();this._moveMarker=this._createMarker(e,this.options.moveIcon)},_createResizeMarker:function(){var t=this._getCorners();this._resizeMarkers=[];for(var e=0,i=t.length;i>e;e++)this._resizeMarkers.push(this._createMarker(t[e],this.options.resizeIcon)),this._resizeMarkers[e]._cornerIndex=e},_onMarkerDragStart:function(t){L.Edit.SimpleShape.prototype._onMarkerDragStart.call(this,t);var e=this._getCorners(),i=t.target,o=i._cornerIndex;this._oppositeCorner=e[(o+2)%4],this._toggleCornerMarkers(0,o)},_onMarkerDragEnd:function(t){var e,i,o=t.target;o===this._moveMarker&&(e=this._shape.getBounds(),i=e.getCenter(),o.setLatLng(i)),this._toggleCornerMarkers(1),this._repositionCornerMarkers(),L.Edit.SimpleShape.prototype._onMarkerDragEnd.call(this,t)},_move:function(t){for(var e,i=this._shape.getLatLngs(),o=this._shape.getBounds(),a=o.getCenter(),s=[],r=0,n=i.length;n>r;r++)e=[i[r].lat-a.lat,i[r].lng-a.lng],s.push([t.lat+e[0],t.lng+e[1]]);this._shape.setLatLngs(s),this._repositionCornerMarkers()},_resize:function(t){var e;this._shape.setBounds(L.latLngBounds(t,this._oppositeCorner)),e=this._shape.getBounds(),this._moveMarker.setLatLng(e.getCenter())},_getCorners:function(){var t=this._shape.getBounds(),e=t.getNorthWest(),i=t.getNorthEast(),o=t.getSouthEast(),a=t.getSouthWest();return[e,i,o,a]},_toggleCornerMarkers:function(t){for(var e=0,i=this._resizeMarkers.length;i>e;e++)this._resizeMarkers[e].setOpacity(t)},_repositionCornerMarkers:function(){for(var t=this._getCorners(),e=0,i=this._resizeMarkers.length;i>e;e++)this._resizeMarkers[e].setLatLng(t[e])}}),L.Rectangle.addInitHook(function(){L.Edit.Rectangle&&(this.editing=new L.Edit.Rectangle(this),this.options.editable&&this.editing.enable())}),L.Edit=L.Edit||{},L.Edit.Circle=L.Edit.SimpleShape.extend({_createMoveMarker:function(){var t=this._shape.getLatLng();this._moveMarker=this._createMarker(t,this.options.moveIcon)},_createResizeMarker:function(){var t=this._shape.getLatLng(),e=this._getResizeMarkerPoint(t);this._resizeMarkers=[],this._resizeMarkers.push(this._createMarker(e,this.options.resizeIcon))},_getResizeMarkerPoint:function(t){var e=this._shape._radius*Math.cos(Math.PI/4),i=this._map.project(t);return this._map.unproject([i.x+e,i.y-e])},_move:function(t){var e=this._getResizeMarkerPoint(t);this._resizeMarkers[0].setLatLng(e),this._shape.setLatLng(t)},_resize:function(t){var e=this._moveMarker.getLatLng(),i=e.distanceTo(t);this._shape.setRadius(i)}}),L.Circle.addInitHook(function(){L.Edit.Circle&&(this.editing=new L.Edit.Circle(this),this.options.editable&&this.editing.enable()),this.on("add",function(){this.editing&&this.editing.enabled()&&this.editing.addHooks()}),this.on("remove",function(){this.editing&&this.editing.enabled()&&this.editing.removeHooks()})}),L.LatLngUtil={cloneLatLngs:function(t){for(var e=[],i=0,o=t.length;o>i;i++)e.push(this.cloneLatLng(t[i]));return e},cloneLatLng:function(t){return L.latLng(t.lat,t.lng)}},L.GeometryUtil=L.extend(L.GeometryUtil||{},{geodesicArea:function(t){var e,i,o=t.length,a=0,s=L.LatLng.DEG_TO_RAD;if(o>2){for(var r=0;o>r;r++)e=t[r],i=t[(r+1)%o],a+=(i.lng-e.lng)*s*(2+Math.sin(e.lat*s)+Math.sin(i.lat*s));a=6378137*a*6378137/2}return Math.abs(a)},readableArea:function(t,e){var i;return e?i=t>=1e4?(1e-4*t).toFixed(2)+" ha":t.toFixed(2)+" m&sup2;":(t*=.836127,i=t>=3097600?(t/3097600).toFixed(2)+" mi&sup2;":t>=4840?(t/4840).toFixed(2)+" acres":Math.ceil(t)+" yd&sup2;"),i},readableDistance:function(t,e){var i;return e?i=t>1e3?(t/1e3).toFixed(2)+" km":Math.ceil(t)+" m":(t*=1.09361,i=t>1760?(t/1760).toFixed(2)+" miles":Math.ceil(t)+" yd"),i}}),L.Util.extend(L.LineUtil,{segmentsIntersect:function(t,e,i,o){return this._checkCounterclockwise(t,i,o)!==this._checkCounterclockwise(e,i,o)&&this._checkCounterclockwise(t,e,i)!==this._checkCounterclockwise(t,e,o)},_checkCounterclockwise:function(t,e,i){return(i.y-t.y)*(e.x-t.x)>(e.y-t.y)*(i.x-t.x)}}),L.Polyline.include({intersects:function(){var t,e,i,o=this._originalPoints,a=o?o.length:0;if(this._tooFewPointsForIntersection())return!1;for(t=a-1;t>=3;t--)if(e=o[t-1],i=o[t],this._lineSegmentsIntersectsRange(e,i,t-2))return!0;return!1},newLatLngIntersects:function(t,e){return this._map?this.newPointIntersects(this._map.latLngToLayerPoint(t),e):!1},newPointIntersects:function(t,e){var i=this._originalPoints,o=i?i.length:0,a=i?i[o-1]:null,s=o-2;return this._tooFewPointsForIntersection(1)?!1:this._lineSegmentsIntersectsRange(a,t,s,e?1:0)},_tooFewPointsForIntersection:function(t){var e=this._originalPoints,i=e?e.length:0;return i+=t||0,!this._originalPoints||3>=i},_lineSegmentsIntersectsRange:function(t,e,i,o){var a,s,r=this._originalPoints;o=o||0;for(var n=i;n>o;n--)if(a=r[n-1],s=r[n],L.LineUtil.segmentsIntersect(t,e,a,s))return!0;return!1}}),L.Polygon.include({intersects:function(){var t,e,i,o,a,s=this._originalPoints;return this._tooFewPointsForIntersection()?!1:(t=L.Polyline.prototype.intersects.call(this))?!0:(e=s.length,i=s[0],o=s[e-1],a=e-2,this._lineSegmentsIntersectsRange(o,i,a,1))}}),L.Control.Draw=L.Control.extend({options:{position:"topleft",draw:{},edit:!1},initialize:function(t){if(L.version<"0.7")throw new Error("Leaflet.draw 0.2.3+ requires Leaflet 0.7.0+. Download latest from https://github.com/Leaflet/Leaflet/");L.Control.prototype.initialize.call(this,t);var e,i;this._toolbars={},L.DrawToolbar&&this.options.draw&&(i=new L.DrawToolbar(this.options.draw),e=L.stamp(i),this._toolbars[e]=i,this._toolbars[e].on("enable",this._toolbarEnabled,this)),L.EditToolbar&&this.options.edit&&(i=new L.EditToolbar(this.options.edit),e=L.stamp(i),this._toolbars[e]=i,this._toolbars[e].on("enable",this._toolbarEnabled,this))},onAdd:function(t){var e,i=L.DomUtil.create("div","leaflet-draw"),o=!1,a="leaflet-draw-toolbar-top";for(var s in this._toolbars)this._toolbars.hasOwnProperty(s)&&(e=this._toolbars[s].addToolbar(t),e&&(o||(L.DomUtil.hasClass(e,a)||L.DomUtil.addClass(e.childNodes[0],a),o=!0),i.appendChild(e)));return i},onRemove:function(){for(var t in this._toolbars)this._toolbars.hasOwnProperty(t)&&this._toolbars[t].removeToolbar()},setDrawingOptions:function(t){for(var e in this._toolbars)this._toolbars[e]instanceof L.DrawToolbar&&this._toolbars[e].setOptions(t)},_toolbarEnabled:function(t){var e=""+L.stamp(t.target);for(var i in this._toolbars)this._toolbars.hasOwnProperty(i)&&i!==e&&this._toolbars[i].disable()}}),L.Map.mergeOptions({drawControlTooltips:!0,drawControl:!1}),L.Map.addInitHook(function(){this.options.drawControl&&(this.drawControl=new L.Control.Draw,this.addControl(this.drawControl))}),L.Toolbar=L.Class.extend({includes:[L.Mixin.Events],initialize:function(t){L.setOptions(this,t),this._modes={},this._actionButtons=[],this._activeMode=null},enabled:function(){return null!==this._activeMode},disable:function(){this.enabled()&&this._activeMode.handler.disable()},addToolbar:function(t){var e,i=L.DomUtil.create("div","leaflet-draw-section"),o=0,a=this._toolbarClass||"",s=this.getModeHandlers(t);for(this._toolbarContainer=L.DomUtil.create("div","leaflet-draw-toolbar leaflet-bar"),this._map=t,e=0;e<s.length;e++)s[e].enabled&&this._initModeHandler(s[e].handler,this._toolbarContainer,o++,a,s[e].title);return o?(this._lastButtonIndex=--o,this._actionsContainer=L.DomUtil.create("ul","leaflet-draw-actions"),i.appendChild(this._toolbarContainer),i.appendChild(this._actionsContainer),i):void 0},removeToolbar:function(){for(var t in this._modes)this._modes.hasOwnProperty(t)&&(this._disposeButton(this._modes[t].button,this._modes[t].handler.enable,this._modes[t].handler),this._modes[t].handler.disable(),this._modes[t].handler.off("enabled",this._handlerActivated,this).off("disabled",this._handlerDeactivated,this));this._modes={};for(var e=0,i=this._actionButtons.length;i>e;e++)this._disposeButton(this._actionButtons[e].button,this._actionButtons[e].callback,this);this._actionButtons=[],this._actionsContainer=null},_initModeHandler:function(t,e,i,o,a){var s=t.type;this._modes[s]={},this._modes[s].handler=t,this._modes[s].button=this._createButton({title:a,className:o+"-"+s,container:e,callback:this._modes[s].handler.enable,context:this._modes[s].handler}),this._modes[s].buttonIndex=i,this._modes[s].handler.on("enabled",this._handlerActivated,this).on("disabled",this._handlerDeactivated,this)},_createButton:function(t){var e=L.DomUtil.create("a",t.className||"",t.container);return e.href="#",t.text&&(e.innerHTML=t.text),t.title&&(e.title=t.title),L.DomEvent.on(e,"click",L.DomEvent.stopPropagation).on(e,"mousedown",L.DomEvent.stopPropagation).on(e,"dblclick",L.DomEvent.stopPropagation).on(e,"click",L.DomEvent.preventDefault).on(e,"click",t.callback,t.context),e},_disposeButton:function(t,e){L.DomEvent.off(t,"click",L.DomEvent.stopPropagation).off(t,"mousedown",L.DomEvent.stopPropagation).off(t,"dblclick",L.DomEvent.stopPropagation).off(t,"click",L.DomEvent.preventDefault).off(t,"click",e)},_handlerActivated:function(t){this.disable(),this._activeMode=this._modes[t.handler],L.DomUtil.addClass(this._activeMode.button,"leaflet-draw-toolbar-button-enabled"),this._showActionsToolbar(),this.fire("enable")},_handlerDeactivated:function(){this._hideActionsToolbar(),L.DomUtil.removeClass(this._activeMode.button,"leaflet-draw-toolbar-button-enabled"),this._activeMode=null,this.fire("disable")},_createActions:function(t){var e,i,o,a,s=this._actionsContainer,r=this.getActions(t),n=r.length;for(i=0,o=this._actionButtons.length;o>i;i++)this._disposeButton(this._actionButtons[i].button,this._actionButtons[i].callback);for(this._actionButtons=[];s.firstChild;)s.removeChild(s.firstChild);for(var l=0;n>l;l++)"enabled"in r[l]&&!r[l].enabled||(e=L.DomUtil.create("li","",s),a=this._createButton({title:r[l].title,text:r[l].text,container:e,callback:r[l].callback,context:r[l].context}),this._actionButtons.push({button:a,callback:r[l].callback}))},_showActionsToolbar:function(){var t=this._activeMode.buttonIndex,e=this._lastButtonIndex,i=this._activeMode.button.offsetTop-1;this._createActions(this._activeMode.handler),this._actionsContainer.style.top=i+"px",0===t&&(L.DomUtil.addClass(this._toolbarContainer,"leaflet-draw-toolbar-notop"),L.DomUtil.addClass(this._actionsContainer,"leaflet-draw-actions-top")),t===e&&(L.DomUtil.addClass(this._toolbarContainer,"leaflet-draw-toolbar-nobottom"),L.DomUtil.addClass(this._actionsContainer,"leaflet-draw-actions-bottom")),this._actionsContainer.style.display="block"
},_hideActionsToolbar:function(){this._actionsContainer.style.display="none",L.DomUtil.removeClass(this._toolbarContainer,"leaflet-draw-toolbar-notop"),L.DomUtil.removeClass(this._toolbarContainer,"leaflet-draw-toolbar-nobottom"),L.DomUtil.removeClass(this._actionsContainer,"leaflet-draw-actions-top"),L.DomUtil.removeClass(this._actionsContainer,"leaflet-draw-actions-bottom")}}),L.Tooltip=L.Class.extend({initialize:function(t){this._map=t,this._popupPane=t._panes.popupPane,this._container=t.options.drawControlTooltips?L.DomUtil.create("div","leaflet-draw-tooltip",this._popupPane):null,this._singleLineLabel=!1},dispose:function(){this._container&&(this._popupPane.removeChild(this._container),this._container=null)},updateContent:function(t){return this._container?(t.subtext=t.subtext||"",0!==t.subtext.length||this._singleLineLabel?t.subtext.length>0&&this._singleLineLabel&&(L.DomUtil.removeClass(this._container,"leaflet-draw-tooltip-single"),this._singleLineLabel=!1):(L.DomUtil.addClass(this._container,"leaflet-draw-tooltip-single"),this._singleLineLabel=!0),this._container.innerHTML=(t.subtext.length>0?'<span class="leaflet-draw-tooltip-subtext">'+t.subtext+"</span><br />":"")+"<span>"+t.text+"</span>",this):this},updatePosition:function(t){var e=this._map.latLngToLayerPoint(t),i=this._container;return this._container&&(i.style.visibility="inherit",L.DomUtil.setPosition(i,e)),this},showAsError:function(){return this._container&&L.DomUtil.addClass(this._container,"leaflet-error-draw-tooltip"),this},removeError:function(){return this._container&&L.DomUtil.removeClass(this._container,"leaflet-error-draw-tooltip"),this}}),L.DrawToolbar=L.Toolbar.extend({options:{polyline:{},polygon:{},rectangle:{},circle:{},marker:{}},initialize:function(t){for(var e in this.options)this.options.hasOwnProperty(e)&&t[e]&&(t[e]=L.extend({},this.options[e],t[e]));this._toolbarClass="leaflet-draw-draw",L.Toolbar.prototype.initialize.call(this,t)},getModeHandlers:function(t){return[{enabled:this.options.polyline,handler:new L.Draw.Polyline(t,this.options.polyline),title:L.drawLocal.draw.toolbar.buttons.polyline},{enabled:this.options.polygon,handler:new L.Draw.Polygon(t,this.options.polygon),title:L.drawLocal.draw.toolbar.buttons.polygon},{enabled:this.options.rectangle,handler:new L.Draw.Rectangle(t,this.options.rectangle),title:L.drawLocal.draw.toolbar.buttons.rectangle},{enabled:this.options.circle,handler:new L.Draw.Circle(t,this.options.circle),title:L.drawLocal.draw.toolbar.buttons.circle},{enabled:this.options.marker,handler:new L.Draw.Marker(t,this.options.marker),title:L.drawLocal.draw.toolbar.buttons.marker}]},getActions:function(t){return[{enabled:t.deleteLastVertex,title:L.drawLocal.draw.toolbar.undo.title,text:L.drawLocal.draw.toolbar.undo.text,callback:t.deleteLastVertex,context:t},{title:L.drawLocal.draw.toolbar.actions.title,text:L.drawLocal.draw.toolbar.actions.text,callback:this.disable,context:this}]},setOptions:function(t){L.setOptions(this,t);for(var e in this._modes)this._modes.hasOwnProperty(e)&&t.hasOwnProperty(e)&&this._modes[e].handler.setOptions(t[e])}}),L.EditToolbar=L.Toolbar.extend({options:{edit:{selectedPathOptions:{color:"#fe57a1",opacity:.6,dashArray:"10, 10",fill:!0,fillColor:"#fe57a1",fillOpacity:.1}},remove:{},featureGroup:null},initialize:function(t){t.edit&&("undefined"==typeof t.edit.selectedPathOptions&&(t.edit.selectedPathOptions=this.options.edit.selectedPathOptions),t.edit=L.extend({},this.options.edit,t.edit)),t.remove&&(t.remove=L.extend({},this.options.remove,t.remove)),this._toolbarClass="leaflet-draw-edit",L.Toolbar.prototype.initialize.call(this,t),this._selectedFeatureCount=0},getModeHandlers:function(t){var e=this.options.featureGroup;return[{enabled:this.options.edit,handler:new L.EditToolbar.Edit(t,{featureGroup:e,selectedPathOptions:this.options.edit.selectedPathOptions}),title:L.drawLocal.edit.toolbar.buttons.edit},{enabled:this.options.remove,handler:new L.EditToolbar.Delete(t,{featureGroup:e}),title:L.drawLocal.edit.toolbar.buttons.remove}]},getActions:function(){return[{title:L.drawLocal.edit.toolbar.actions.save.title,text:L.drawLocal.edit.toolbar.actions.save.text,callback:this._save,context:this},{title:L.drawLocal.edit.toolbar.actions.cancel.title,text:L.drawLocal.edit.toolbar.actions.cancel.text,callback:this.disable,context:this}]},addToolbar:function(t){var e=L.Toolbar.prototype.addToolbar.call(this,t);return this._checkDisabled(),this.options.featureGroup.on("layeradd layerremove",this._checkDisabled,this),e},removeToolbar:function(){this.options.featureGroup.off("layeradd layerremove",this._checkDisabled,this),L.Toolbar.prototype.removeToolbar.call(this)},disable:function(){this.enabled()&&(this._activeMode.handler.revertLayers(),L.Toolbar.prototype.disable.call(this))},_save:function(){this._activeMode.handler.save(),this._activeMode.handler.disable()},_checkDisabled:function(){var t,e=this.options.featureGroup,i=0!==e.getLayers().length;this.options.edit&&(t=this._modes[L.EditToolbar.Edit.TYPE].button,i?L.DomUtil.removeClass(t,"leaflet-disabled"):L.DomUtil.addClass(t,"leaflet-disabled"),t.setAttribute("title",i?L.drawLocal.edit.toolbar.buttons.edit:L.drawLocal.edit.toolbar.buttons.editDisabled)),this.options.remove&&(t=this._modes[L.EditToolbar.Delete.TYPE].button,i?L.DomUtil.removeClass(t,"leaflet-disabled"):L.DomUtil.addClass(t,"leaflet-disabled"),t.setAttribute("title",i?L.drawLocal.edit.toolbar.buttons.remove:L.drawLocal.edit.toolbar.buttons.removeDisabled))}}),L.EditToolbar.Edit=L.Handler.extend({statics:{TYPE:"edit"},includes:L.Mixin.Events,initialize:function(t,e){if(L.Handler.prototype.initialize.call(this,t),this._selectedPathOptions=e.selectedPathOptions,this._featureGroup=e.featureGroup,!(this._featureGroup instanceof L.FeatureGroup))throw new Error("options.featureGroup must be a L.FeatureGroup");this._uneditedLayerProps={},this.type=L.EditToolbar.Edit.TYPE},enable:function(){!this._enabled&&this._hasAvailableLayers()&&(this.fire("enabled",{handler:this.type}),this._map.fire("draw:editstart",{handler:this.type}),L.Handler.prototype.enable.call(this),this._featureGroup.on("layeradd",this._enableLayerEdit,this).on("layerremove",this._disableLayerEdit,this))},disable:function(){this._enabled&&(this._featureGroup.off("layeradd",this._enableLayerEdit,this).off("layerremove",this._disableLayerEdit,this),L.Handler.prototype.disable.call(this),this._map.fire("draw:editstop",{handler:this.type}),this.fire("disabled",{handler:this.type}))},addHooks:function(){var t=this._map;t&&(t.getContainer().focus(),this._featureGroup.eachLayer(this._enableLayerEdit,this),this._tooltip=new L.Tooltip(this._map),this._tooltip.updateContent({text:L.drawLocal.edit.handlers.edit.tooltip.text,subtext:L.drawLocal.edit.handlers.edit.tooltip.subtext}),this._map.on("mousemove",this._onMouseMove,this))},removeHooks:function(){this._map&&(this._featureGroup.eachLayer(this._disableLayerEdit,this),this._uneditedLayerProps={},this._tooltip.dispose(),this._tooltip=null,this._map.off("mousemove",this._onMouseMove,this))},revertLayers:function(){this._featureGroup.eachLayer(function(t){this._revertLayer(t)},this)},save:function(){var t=new L.LayerGroup;this._featureGroup.eachLayer(function(e){e.edited&&(t.addLayer(e),e.edited=!1)}),this._map.fire("draw:edited",{layers:t})},_backupLayer:function(t){var e=L.Util.stamp(t);this._uneditedLayerProps[e]||(t instanceof L.Polyline||t instanceof L.Polygon||t instanceof L.Rectangle?this._uneditedLayerProps[e]={latlngs:L.LatLngUtil.cloneLatLngs(t.getLatLngs())}:t instanceof L.Circle?this._uneditedLayerProps[e]={latlng:L.LatLngUtil.cloneLatLng(t.getLatLng()),radius:t.getRadius()}:t instanceof L.Marker&&(this._uneditedLayerProps[e]={latlng:L.LatLngUtil.cloneLatLng(t.getLatLng())}))},_revertLayer:function(t){var e=L.Util.stamp(t);t.edited=!1,this._uneditedLayerProps.hasOwnProperty(e)&&(t instanceof L.Polyline||t instanceof L.Polygon||t instanceof L.Rectangle?t.setLatLngs(this._uneditedLayerProps[e].latlngs):t instanceof L.Circle?(t.setLatLng(this._uneditedLayerProps[e].latlng),t.setRadius(this._uneditedLayerProps[e].radius)):t instanceof L.Marker&&t.setLatLng(this._uneditedLayerProps[e].latlng))},_toggleMarkerHighlight:function(t){if(t._icon){var e=t._icon;e.style.display="none",L.DomUtil.hasClass(e,"leaflet-edit-marker-selected")?(L.DomUtil.removeClass(e,"leaflet-edit-marker-selected"),this._offsetMarker(e,-4)):(L.DomUtil.addClass(e,"leaflet-edit-marker-selected"),this._offsetMarker(e,4)),e.style.display=""}},_offsetMarker:function(t,e){var i=parseInt(t.style.marginTop,10)-e,o=parseInt(t.style.marginLeft,10)-e;t.style.marginTop=i+"px",t.style.marginLeft=o+"px"},_enableLayerEdit:function(t){var e,i=t.layer||t.target||t,o=i instanceof L.Marker;(!o||i._icon)&&(this._backupLayer(i),this._selectedPathOptions&&(e=L.Util.extend({},this._selectedPathOptions),o?this._toggleMarkerHighlight(i):(i.options.previousOptions=L.Util.extend({dashArray:null},i.options),i instanceof L.Circle||i instanceof L.Polygon||i instanceof L.Rectangle||(e.fill=!1),i.setStyle(e))),o?(i.dragging.enable(),i.on("dragend",this._onMarkerDragEnd)):i.editing.enable())},_disableLayerEdit:function(t){var e=t.layer||t.target||t;e.edited=!1,this._selectedPathOptions&&(e instanceof L.Marker?this._toggleMarkerHighlight(e):(e.setStyle(e.options.previousOptions),delete e.options.previousOptions)),e instanceof L.Marker?(e.dragging.disable(),e.off("dragend",this._onMarkerDragEnd,this)):e.editing.disable()},_onMarkerDragEnd:function(t){var e=t.target;e.edited=!0},_onMouseMove:function(t){this._tooltip.updatePosition(t.latlng)},_hasAvailableLayers:function(){return 0!==this._featureGroup.getLayers().length}}),L.EditToolbar.Delete=L.Handler.extend({statics:{TYPE:"remove"},includes:L.Mixin.Events,initialize:function(t,e){if(L.Handler.prototype.initialize.call(this,t),L.Util.setOptions(this,e),this._deletableLayers=this.options.featureGroup,!(this._deletableLayers instanceof L.FeatureGroup))throw new Error("options.featureGroup must be a L.FeatureGroup");this.type=L.EditToolbar.Delete.TYPE},enable:function(){!this._enabled&&this._hasAvailableLayers()&&(this.fire("enabled",{handler:this.type}),this._map.fire("draw:deletestart",{handler:this.type}),L.Handler.prototype.enable.call(this),this._deletableLayers.on("layeradd",this._enableLayerDelete,this).on("layerremove",this._disableLayerDelete,this))},disable:function(){this._enabled&&(this._deletableLayers.off("layeradd",this._enableLayerDelete,this).off("layerremove",this._disableLayerDelete,this),L.Handler.prototype.disable.call(this),this._map.fire("draw:deletestop",{handler:this.type}),this.fire("disabled",{handler:this.type}))},addHooks:function(){var t=this._map;t&&(t.getContainer().focus(),this._deletableLayers.eachLayer(this._enableLayerDelete,this),this._deletedLayers=new L.layerGroup,this._tooltip=new L.Tooltip(this._map),this._tooltip.updateContent({text:L.drawLocal.edit.handlers.remove.tooltip.text}),this._map.on("mousemove",this._onMouseMove,this))},removeHooks:function(){this._map&&(this._deletableLayers.eachLayer(this._disableLayerDelete,this),this._deletedLayers=null,this._tooltip.dispose(),this._tooltip=null,this._map.off("mousemove",this._onMouseMove,this))},revertLayers:function(){this._deletedLayers.eachLayer(function(t){this._deletableLayers.addLayer(t)},this)},save:function(){this._map.fire("draw:deleted",{layers:this._deletedLayers})},_enableLayerDelete:function(t){var e=t.layer||t.target||t;e.on("click",this._removeLayer,this)},_disableLayerDelete:function(t){var e=t.layer||t.target||t;e.off("click",this._removeLayer,this),this._deletedLayers.removeLayer(e)},_removeLayer:function(t){var e=t.layer||t.target||t;this._deletableLayers.removeLayer(e),this._deletedLayers.addLayer(e)},_onMouseMove:function(t){this._tooltip.updatePosition(t.latlng)},_hasAvailableLayers:function(){return 0!==this._deletableLayers.getLayers().length}})}(window,document);
},{}],3:[function(require,module,exports){
/*
 Leaflet, a JavaScript library for mobile-friendly interactive maps. http://leafletjs.com
 (c) 2010-2013, Vladimir Agafonkin
 (c) 2010-2011, CloudMade
*/
(function (window, document, undefined) {
var oldL = window.L,
    L = {};

L.version = '0.7.5';

// define Leaflet for Node module pattern loaders, including Browserify
if (typeof module === 'object' && typeof module.exports === 'object') {
	module.exports = L;

// define Leaflet as an AMD module
} else if (typeof define === 'function' && define.amd) {
	define(L);
}

// define Leaflet as a global L variable, saving the original L to restore later if needed

L.noConflict = function () {
	window.L = oldL;
	return this;
};

window.L = L;


/*
 * L.Util contains various utility functions used throughout Leaflet code.
 */

L.Util = {
	extend: function (dest) { // (Object[, Object, ...]) ->
		var sources = Array.prototype.slice.call(arguments, 1),
		    i, j, len, src;

		for (j = 0, len = sources.length; j < len; j++) {
			src = sources[j] || {};
			for (i in src) {
				if (src.hasOwnProperty(i)) {
					dest[i] = src[i];
				}
			}
		}
		return dest;
	},

	bind: function (fn, obj) { // (Function, Object) -> Function
		var args = arguments.length > 2 ? Array.prototype.slice.call(arguments, 2) : null;
		return function () {
			return fn.apply(obj, args || arguments);
		};
	},

	stamp: (function () {
		var lastId = 0,
		    key = '_leaflet_id';
		return function (obj) {
			obj[key] = obj[key] || ++lastId;
			return obj[key];
		};
	}()),

	invokeEach: function (obj, method, context) {
		var i, args;

		if (typeof obj === 'object') {
			args = Array.prototype.slice.call(arguments, 3);

			for (i in obj) {
				method.apply(context, [i, obj[i]].concat(args));
			}
			return true;
		}

		return false;
	},

	limitExecByInterval: function (fn, time, context) {
		var lock, execOnUnlock;

		return function wrapperFn() {
			var args = arguments;

			if (lock) {
				execOnUnlock = true;
				return;
			}

			lock = true;

			setTimeout(function () {
				lock = false;

				if (execOnUnlock) {
					wrapperFn.apply(context, args);
					execOnUnlock = false;
				}
			}, time);

			fn.apply(context, args);
		};
	},

	falseFn: function () {
		return false;
	},

	formatNum: function (num, digits) {
		var pow = Math.pow(10, digits || 5);
		return Math.round(num * pow) / pow;
	},

	trim: function (str) {
		return str.trim ? str.trim() : str.replace(/^\s+|\s+$/g, '');
	},

	splitWords: function (str) {
		return L.Util.trim(str).split(/\s+/);
	},

	setOptions: function (obj, options) {
		obj.options = L.extend({}, obj.options, options);
		return obj.options;
	},

	getParamString: function (obj, existingUrl, uppercase) {
		var params = [];
		for (var i in obj) {
			params.push(encodeURIComponent(uppercase ? i.toUpperCase() : i) + '=' + encodeURIComponent(obj[i]));
		}
		return ((!existingUrl || existingUrl.indexOf('?') === -1) ? '?' : '&') + params.join('&');
	},
	template: function (str, data) {
		return str.replace(/\{ *([\w_]+) *\}/g, function (str, key) {
			var value = data[key];
			if (value === undefined) {
				throw new Error('No value provided for variable ' + str);
			} else if (typeof value === 'function') {
				value = value(data);
			}
			return value;
		});
	},

	isArray: Array.isArray || function (obj) {
		return (Object.prototype.toString.call(obj) === '[object Array]');
	},

	emptyImageUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
};

(function () {

	// inspired by http://paulirish.com/2011/requestanimationframe-for-smart-animating/

	function getPrefixed(name) {
		var i, fn,
		    prefixes = ['webkit', 'moz', 'o', 'ms'];

		for (i = 0; i < prefixes.length && !fn; i++) {
			fn = window[prefixes[i] + name];
		}

		return fn;
	}

	var lastTime = 0;

	function timeoutDefer(fn) {
		var time = +new Date(),
		    timeToCall = Math.max(0, 16 - (time - lastTime));

		lastTime = time + timeToCall;
		return window.setTimeout(fn, timeToCall);
	}

	var requestFn = window.requestAnimationFrame ||
	        getPrefixed('RequestAnimationFrame') || timeoutDefer;

	var cancelFn = window.cancelAnimationFrame ||
	        getPrefixed('CancelAnimationFrame') ||
	        getPrefixed('CancelRequestAnimationFrame') ||
	        function (id) { window.clearTimeout(id); };


	L.Util.requestAnimFrame = function (fn, context, immediate, element) {
		fn = L.bind(fn, context);

		if (immediate && requestFn === timeoutDefer) {
			fn();
		} else {
			return requestFn.call(window, fn, element);
		}
	};

	L.Util.cancelAnimFrame = function (id) {
		if (id) {
			cancelFn.call(window, id);
		}
	};

}());

// shortcuts for most used utility functions
L.extend = L.Util.extend;
L.bind = L.Util.bind;
L.stamp = L.Util.stamp;
L.setOptions = L.Util.setOptions;


/*
 * L.Class powers the OOP facilities of the library.
 * Thanks to John Resig and Dean Edwards for inspiration!
 */

L.Class = function () {};

L.Class.extend = function (props) {

	// extended class with the new prototype
	var NewClass = function () {

		// call the constructor
		if (this.initialize) {
			this.initialize.apply(this, arguments);
		}

		// call all constructor hooks
		if (this._initHooks) {
			this.callInitHooks();
		}
	};

	// instantiate class without calling constructor
	var F = function () {};
	F.prototype = this.prototype;

	var proto = new F();
	proto.constructor = NewClass;

	NewClass.prototype = proto;

	//inherit parent's statics
	for (var i in this) {
		if (this.hasOwnProperty(i) && i !== 'prototype') {
			NewClass[i] = this[i];
		}
	}

	// mix static properties into the class
	if (props.statics) {
		L.extend(NewClass, props.statics);
		delete props.statics;
	}

	// mix includes into the prototype
	if (props.includes) {
		L.Util.extend.apply(null, [proto].concat(props.includes));
		delete props.includes;
	}

	// merge options
	if (props.options && proto.options) {
		props.options = L.extend({}, proto.options, props.options);
	}

	// mix given properties into the prototype
	L.extend(proto, props);

	proto._initHooks = [];

	var parent = this;
	// jshint camelcase: false
	NewClass.__super__ = parent.prototype;

	// add method for calling all hooks
	proto.callInitHooks = function () {

		if (this._initHooksCalled) { return; }

		if (parent.prototype.callInitHooks) {
			parent.prototype.callInitHooks.call(this);
		}

		this._initHooksCalled = true;

		for (var i = 0, len = proto._initHooks.length; i < len; i++) {
			proto._initHooks[i].call(this);
		}
	};

	return NewClass;
};


// method for adding properties to prototype
L.Class.include = function (props) {
	L.extend(this.prototype, props);
};

// merge new default options to the Class
L.Class.mergeOptions = function (options) {
	L.extend(this.prototype.options, options);
};

// add a constructor hook
L.Class.addInitHook = function (fn) { // (Function) || (String, args...)
	var args = Array.prototype.slice.call(arguments, 1);

	var init = typeof fn === 'function' ? fn : function () {
		this[fn].apply(this, args);
	};

	this.prototype._initHooks = this.prototype._initHooks || [];
	this.prototype._initHooks.push(init);
};


/*
 * L.Mixin.Events is used to add custom events functionality to Leaflet classes.
 */

var eventsKey = '_leaflet_events';

L.Mixin = {};

L.Mixin.Events = {

	addEventListener: function (types, fn, context) { // (String, Function[, Object]) or (Object[, Object])

		// types can be a map of types/handlers
		if (L.Util.invokeEach(types, this.addEventListener, this, fn, context)) { return this; }

		var events = this[eventsKey] = this[eventsKey] || {},
		    contextId = context && context !== this && L.stamp(context),
		    i, len, event, type, indexKey, indexLenKey, typeIndex;

		// types can be a string of space-separated words
		types = L.Util.splitWords(types);

		for (i = 0, len = types.length; i < len; i++) {
			event = {
				action: fn,
				context: context || this
			};
			type = types[i];

			if (contextId) {
				// store listeners of a particular context in a separate hash (if it has an id)
				// gives a major performance boost when removing thousands of map layers

				indexKey = type + '_idx';
				indexLenKey = indexKey + '_len';

				typeIndex = events[indexKey] = events[indexKey] || {};

				if (!typeIndex[contextId]) {
					typeIndex[contextId] = [];

					// keep track of the number of keys in the index to quickly check if it's empty
					events[indexLenKey] = (events[indexLenKey] || 0) + 1;
				}

				typeIndex[contextId].push(event);


			} else {
				events[type] = events[type] || [];
				events[type].push(event);
			}
		}

		return this;
	},

	hasEventListeners: function (type) { // (String) -> Boolean
		var events = this[eventsKey];
		return !!events && ((type in events && events[type].length > 0) ||
		                    (type + '_idx' in events && events[type + '_idx_len'] > 0));
	},

	removeEventListener: function (types, fn, context) { // ([String, Function, Object]) or (Object[, Object])

		if (!this[eventsKey]) {
			return this;
		}

		if (!types) {
			return this.clearAllEventListeners();
		}

		if (L.Util.invokeEach(types, this.removeEventListener, this, fn, context)) { return this; }

		var events = this[eventsKey],
		    contextId = context && context !== this && L.stamp(context),
		    i, len, type, listeners, j, indexKey, indexLenKey, typeIndex, removed;

		types = L.Util.splitWords(types);

		for (i = 0, len = types.length; i < len; i++) {
			type = types[i];
			indexKey = type + '_idx';
			indexLenKey = indexKey + '_len';

			typeIndex = events[indexKey];

			if (!fn) {
				// clear all listeners for a type if function isn't specified
				delete events[type];
				delete events[indexKey];
				delete events[indexLenKey];

			} else {
				listeners = contextId && typeIndex ? typeIndex[contextId] : events[type];

				if (listeners) {
					for (j = listeners.length - 1; j >= 0; j--) {
						if ((listeners[j].action === fn) && (!context || (listeners[j].context === context))) {
							removed = listeners.splice(j, 1);
							// set the old action to a no-op, because it is possible
							// that the listener is being iterated over as part of a dispatch
							removed[0].action = L.Util.falseFn;
						}
					}

					if (context && typeIndex && (listeners.length === 0)) {
						delete typeIndex[contextId];
						events[indexLenKey]--;
					}
				}
			}
		}

		return this;
	},

	clearAllEventListeners: function () {
		delete this[eventsKey];
		return this;
	},

	fireEvent: function (type, data) { // (String[, Object])
		if (!this.hasEventListeners(type)) {
			return this;
		}

		var event = L.Util.extend({}, data, { type: type, target: this });

		var events = this[eventsKey],
		    listeners, i, len, typeIndex, contextId;

		if (events[type]) {
			// make sure adding/removing listeners inside other listeners won't cause infinite loop
			listeners = events[type].slice();

			for (i = 0, len = listeners.length; i < len; i++) {
				listeners[i].action.call(listeners[i].context, event);
			}
		}

		// fire event for the context-indexed listeners as well
		typeIndex = events[type + '_idx'];

		for (contextId in typeIndex) {
			listeners = typeIndex[contextId].slice();

			if (listeners) {
				for (i = 0, len = listeners.length; i < len; i++) {
					listeners[i].action.call(listeners[i].context, event);
				}
			}
		}

		return this;
	},

	addOneTimeEventListener: function (types, fn, context) {

		if (L.Util.invokeEach(types, this.addOneTimeEventListener, this, fn, context)) { return this; }

		var handler = L.bind(function () {
			this
			    .removeEventListener(types, fn, context)
			    .removeEventListener(types, handler, context);
		}, this);

		return this
		    .addEventListener(types, fn, context)
		    .addEventListener(types, handler, context);
	}
};

L.Mixin.Events.on = L.Mixin.Events.addEventListener;
L.Mixin.Events.off = L.Mixin.Events.removeEventListener;
L.Mixin.Events.once = L.Mixin.Events.addOneTimeEventListener;
L.Mixin.Events.fire = L.Mixin.Events.fireEvent;


/*
 * L.Browser handles different browser and feature detections for internal Leaflet use.
 */

(function () {

	var ie = 'ActiveXObject' in window,
		ielt9 = ie && !document.addEventListener,

	    // terrible browser detection to work around Safari / iOS / Android browser bugs
	    ua = navigator.userAgent.toLowerCase(),
	    webkit = ua.indexOf('webkit') !== -1,
	    chrome = ua.indexOf('chrome') !== -1,
	    phantomjs = ua.indexOf('phantom') !== -1,
	    android = ua.indexOf('android') !== -1,
	    android23 = ua.search('android [23]') !== -1,
		gecko = ua.indexOf('gecko') !== -1,

	    mobile = typeof orientation !== undefined + '',
	    msPointer = !window.PointerEvent && window.MSPointerEvent,
		pointer = (window.PointerEvent && window.navigator.pointerEnabled && window.navigator.maxTouchPoints) ||
				  msPointer,
	    retina = ('devicePixelRatio' in window && window.devicePixelRatio > 1) ||
	             ('matchMedia' in window && window.matchMedia('(min-resolution:144dpi)') &&
	              window.matchMedia('(min-resolution:144dpi)').matches),

	    doc = document.documentElement,
	    ie3d = ie && ('transition' in doc.style),
	    webkit3d = ('WebKitCSSMatrix' in window) && ('m11' in new window.WebKitCSSMatrix()) && !android23,
	    gecko3d = 'MozPerspective' in doc.style,
	    opera3d = 'OTransition' in doc.style,
	    any3d = !window.L_DISABLE_3D && (ie3d || webkit3d || gecko3d || opera3d) && !phantomjs;

	var touch = !window.L_NO_TOUCH && !phantomjs && (pointer || 'ontouchstart' in window ||
		(window.DocumentTouch && document instanceof window.DocumentTouch));

	L.Browser = {
		ie: ie,
		ielt9: ielt9,
		webkit: webkit,
		gecko: gecko && !webkit && !window.opera && !ie,

		android: android,
		android23: android23,

		chrome: chrome,

		ie3d: ie3d,
		webkit3d: webkit3d,
		gecko3d: gecko3d,
		opera3d: opera3d,
		any3d: any3d,

		mobile: mobile,
		mobileWebkit: mobile && webkit,
		mobileWebkit3d: mobile && webkit3d,
		mobileOpera: mobile && window.opera,

		touch: touch,
		msPointer: msPointer,
		pointer: pointer,

		retina: retina
	};

}());


/*
 * L.Point represents a point with x and y coordinates.
 */

L.Point = function (/*Number*/ x, /*Number*/ y, /*Boolean*/ round) {
	this.x = (round ? Math.round(x) : x);
	this.y = (round ? Math.round(y) : y);
};

L.Point.prototype = {

	clone: function () {
		return new L.Point(this.x, this.y);
	},

	// non-destructive, returns a new point
	add: function (point) {
		return this.clone()._add(L.point(point));
	},

	// destructive, used directly for performance in situations where it's safe to modify existing point
	_add: function (point) {
		this.x += point.x;
		this.y += point.y;
		return this;
	},

	subtract: function (point) {
		return this.clone()._subtract(L.point(point));
	},

	_subtract: function (point) {
		this.x -= point.x;
		this.y -= point.y;
		return this;
	},

	divideBy: function (num) {
		return this.clone()._divideBy(num);
	},

	_divideBy: function (num) {
		this.x /= num;
		this.y /= num;
		return this;
	},

	multiplyBy: function (num) {
		return this.clone()._multiplyBy(num);
	},

	_multiplyBy: function (num) {
		this.x *= num;
		this.y *= num;
		return this;
	},

	round: function () {
		return this.clone()._round();
	},

	_round: function () {
		this.x = Math.round(this.x);
		this.y = Math.round(this.y);
		return this;
	},

	floor: function () {
		return this.clone()._floor();
	},

	_floor: function () {
		this.x = Math.floor(this.x);
		this.y = Math.floor(this.y);
		return this;
	},

	distanceTo: function (point) {
		point = L.point(point);

		var x = point.x - this.x,
		    y = point.y - this.y;

		return Math.sqrt(x * x + y * y);
	},

	equals: function (point) {
		point = L.point(point);

		return point.x === this.x &&
		       point.y === this.y;
	},

	contains: function (point) {
		point = L.point(point);

		return Math.abs(point.x) <= Math.abs(this.x) &&
		       Math.abs(point.y) <= Math.abs(this.y);
	},

	toString: function () {
		return 'Point(' +
		        L.Util.formatNum(this.x) + ', ' +
		        L.Util.formatNum(this.y) + ')';
	}
};

L.point = function (x, y, round) {
	if (x instanceof L.Point) {
		return x;
	}
	if (L.Util.isArray(x)) {
		return new L.Point(x[0], x[1]);
	}
	if (x === undefined || x === null) {
		return x;
	}
	return new L.Point(x, y, round);
};


/*
 * L.Bounds represents a rectangular area on the screen in pixel coordinates.
 */

L.Bounds = function (a, b) { //(Point, Point) or Point[]
	if (!a) { return; }

	var points = b ? [a, b] : a;

	for (var i = 0, len = points.length; i < len; i++) {
		this.extend(points[i]);
	}
};

L.Bounds.prototype = {
	// extend the bounds to contain the given point
	extend: function (point) { // (Point)
		point = L.point(point);

		if (!this.min && !this.max) {
			this.min = point.clone();
			this.max = point.clone();
		} else {
			this.min.x = Math.min(point.x, this.min.x);
			this.max.x = Math.max(point.x, this.max.x);
			this.min.y = Math.min(point.y, this.min.y);
			this.max.y = Math.max(point.y, this.max.y);
		}
		return this;
	},

	getCenter: function (round) { // (Boolean) -> Point
		return new L.Point(
		        (this.min.x + this.max.x) / 2,
		        (this.min.y + this.max.y) / 2, round);
	},

	getBottomLeft: function () { // -> Point
		return new L.Point(this.min.x, this.max.y);
	},

	getTopRight: function () { // -> Point
		return new L.Point(this.max.x, this.min.y);
	},

	getSize: function () {
		return this.max.subtract(this.min);
	},

	contains: function (obj) { // (Bounds) or (Point) -> Boolean
		var min, max;

		if (typeof obj[0] === 'number' || obj instanceof L.Point) {
			obj = L.point(obj);
		} else {
			obj = L.bounds(obj);
		}

		if (obj instanceof L.Bounds) {
			min = obj.min;
			max = obj.max;
		} else {
			min = max = obj;
		}

		return (min.x >= this.min.x) &&
		       (max.x <= this.max.x) &&
		       (min.y >= this.min.y) &&
		       (max.y <= this.max.y);
	},

	intersects: function (bounds) { // (Bounds) -> Boolean
		bounds = L.bounds(bounds);

		var min = this.min,
		    max = this.max,
		    min2 = bounds.min,
		    max2 = bounds.max,
		    xIntersects = (max2.x >= min.x) && (min2.x <= max.x),
		    yIntersects = (max2.y >= min.y) && (min2.y <= max.y);

		return xIntersects && yIntersects;
	},

	isValid: function () {
		return !!(this.min && this.max);
	}
};

L.bounds = function (a, b) { // (Bounds) or (Point, Point) or (Point[])
	if (!a || a instanceof L.Bounds) {
		return a;
	}
	return new L.Bounds(a, b);
};


/*
 * L.Transformation is an utility class to perform simple point transformations through a 2d-matrix.
 */

L.Transformation = function (a, b, c, d) {
	this._a = a;
	this._b = b;
	this._c = c;
	this._d = d;
};

L.Transformation.prototype = {
	transform: function (point, scale) { // (Point, Number) -> Point
		return this._transform(point.clone(), scale);
	},

	// destructive transform (faster)
	_transform: function (point, scale) {
		scale = scale || 1;
		point.x = scale * (this._a * point.x + this._b);
		point.y = scale * (this._c * point.y + this._d);
		return point;
	},

	untransform: function (point, scale) {
		scale = scale || 1;
		return new L.Point(
		        (point.x / scale - this._b) / this._a,
		        (point.y / scale - this._d) / this._c);
	}
};


/*
 * L.DomUtil contains various utility functions for working with DOM.
 */

L.DomUtil = {
	get: function (id) {
		return (typeof id === 'string' ? document.getElementById(id) : id);
	},

	getStyle: function (el, style) {

		var value = el.style[style];

		if (!value && el.currentStyle) {
			value = el.currentStyle[style];
		}

		if ((!value || value === 'auto') && document.defaultView) {
			var css = document.defaultView.getComputedStyle(el, null);
			value = css ? css[style] : null;
		}

		return value === 'auto' ? null : value;
	},

	getViewportOffset: function (element) {

		var top = 0,
		    left = 0,
		    el = element,
		    docBody = document.body,
		    docEl = document.documentElement,
		    pos;

		do {
			top  += el.offsetTop  || 0;
			left += el.offsetLeft || 0;

			//add borders
			top += parseInt(L.DomUtil.getStyle(el, 'borderTopWidth'), 10) || 0;
			left += parseInt(L.DomUtil.getStyle(el, 'borderLeftWidth'), 10) || 0;

			pos = L.DomUtil.getStyle(el, 'position');

			if (el.offsetParent === docBody && pos === 'absolute') { break; }

			if (pos === 'fixed') {
				top  += docBody.scrollTop  || docEl.scrollTop  || 0;
				left += docBody.scrollLeft || docEl.scrollLeft || 0;
				break;
			}

			if (pos === 'relative' && !el.offsetLeft) {
				var width = L.DomUtil.getStyle(el, 'width'),
				    maxWidth = L.DomUtil.getStyle(el, 'max-width'),
				    r = el.getBoundingClientRect();

				if (width !== 'none' || maxWidth !== 'none') {
					left += r.left + el.clientLeft;
				}

				//calculate full y offset since we're breaking out of the loop
				top += r.top + (docBody.scrollTop  || docEl.scrollTop  || 0);

				break;
			}

			el = el.offsetParent;

		} while (el);

		el = element;

		do {
			if (el === docBody) { break; }

			top  -= el.scrollTop  || 0;
			left -= el.scrollLeft || 0;

			el = el.parentNode;
		} while (el);

		return new L.Point(left, top);
	},

	documentIsLtr: function () {
		if (!L.DomUtil._docIsLtrCached) {
			L.DomUtil._docIsLtrCached = true;
			L.DomUtil._docIsLtr = L.DomUtil.getStyle(document.body, 'direction') === 'ltr';
		}
		return L.DomUtil._docIsLtr;
	},

	create: function (tagName, className, container) {

		var el = document.createElement(tagName);
		el.className = className;

		if (container) {
			container.appendChild(el);
		}

		return el;
	},

	hasClass: function (el, name) {
		if (el.classList !== undefined) {
			return el.classList.contains(name);
		}
		var className = L.DomUtil._getClass(el);
		return className.length > 0 && new RegExp('(^|\\s)' + name + '(\\s|$)').test(className);
	},

	addClass: function (el, name) {
		if (el.classList !== undefined) {
			var classes = L.Util.splitWords(name);
			for (var i = 0, len = classes.length; i < len; i++) {
				el.classList.add(classes[i]);
			}
		} else if (!L.DomUtil.hasClass(el, name)) {
			var className = L.DomUtil._getClass(el);
			L.DomUtil._setClass(el, (className ? className + ' ' : '') + name);
		}
	},

	removeClass: function (el, name) {
		if (el.classList !== undefined) {
			el.classList.remove(name);
		} else {
			L.DomUtil._setClass(el, L.Util.trim((' ' + L.DomUtil._getClass(el) + ' ').replace(' ' + name + ' ', ' ')));
		}
	},

	_setClass: function (el, name) {
		if (el.className.baseVal === undefined) {
			el.className = name;
		} else {
			// in case of SVG element
			el.className.baseVal = name;
		}
	},

	_getClass: function (el) {
		return el.className.baseVal === undefined ? el.className : el.className.baseVal;
	},

	setOpacity: function (el, value) {

		if ('opacity' in el.style) {
			el.style.opacity = value;

		} else if ('filter' in el.style) {

			var filter = false,
			    filterName = 'DXImageTransform.Microsoft.Alpha';

			// filters collection throws an error if we try to retrieve a filter that doesn't exist
			try {
				filter = el.filters.item(filterName);
			} catch (e) {
				// don't set opacity to 1 if we haven't already set an opacity,
				// it isn't needed and breaks transparent pngs.
				if (value === 1) { return; }
			}

			value = Math.round(value * 100);

			if (filter) {
				filter.Enabled = (value !== 100);
				filter.Opacity = value;
			} else {
				el.style.filter += ' progid:' + filterName + '(opacity=' + value + ')';
			}
		}
	},

	testProp: function (props) {

		var style = document.documentElement.style;

		for (var i = 0; i < props.length; i++) {
			if (props[i] in style) {
				return props[i];
			}
		}
		return false;
	},

	getTranslateString: function (point) {
		// on WebKit browsers (Chrome/Safari/iOS Safari/Android) using translate3d instead of translate
		// makes animation smoother as it ensures HW accel is used. Firefox 13 doesn't care
		// (same speed either way), Opera 12 doesn't support translate3d

		var is3d = L.Browser.webkit3d,
		    open = 'translate' + (is3d ? '3d' : '') + '(',
		    close = (is3d ? ',0' : '') + ')';

		return open + point.x + 'px,' + point.y + 'px' + close;
	},

	getScaleString: function (scale, origin) {

		var preTranslateStr = L.DomUtil.getTranslateString(origin.add(origin.multiplyBy(-1 * scale))),
		    scaleStr = ' scale(' + scale + ') ';

		return preTranslateStr + scaleStr;
	},

	setPosition: function (el, point, disable3D) { // (HTMLElement, Point[, Boolean])

		// jshint camelcase: false
		el._leaflet_pos = point;

		if (!disable3D && L.Browser.any3d) {
			el.style[L.DomUtil.TRANSFORM] =  L.DomUtil.getTranslateString(point);
		} else {
			el.style.left = point.x + 'px';
			el.style.top = point.y + 'px';
		}
	},

	getPosition: function (el) {
		// this method is only used for elements previously positioned using setPosition,
		// so it's safe to cache the position for performance

		// jshint camelcase: false
		return el._leaflet_pos;
	}
};


// prefix style property names

L.DomUtil.TRANSFORM = L.DomUtil.testProp(
        ['transform', 'WebkitTransform', 'OTransform', 'MozTransform', 'msTransform']);

// webkitTransition comes first because some browser versions that drop vendor prefix don't do
// the same for the transitionend event, in particular the Android 4.1 stock browser

L.DomUtil.TRANSITION = L.DomUtil.testProp(
        ['webkitTransition', 'transition', 'OTransition', 'MozTransition', 'msTransition']);

L.DomUtil.TRANSITION_END =
        L.DomUtil.TRANSITION === 'webkitTransition' || L.DomUtil.TRANSITION === 'OTransition' ?
        L.DomUtil.TRANSITION + 'End' : 'transitionend';

(function () {
    if ('onselectstart' in document) {
        L.extend(L.DomUtil, {
            disableTextSelection: function () {
                L.DomEvent.on(window, 'selectstart', L.DomEvent.preventDefault);
            },

            enableTextSelection: function () {
                L.DomEvent.off(window, 'selectstart', L.DomEvent.preventDefault);
            }
        });
    } else {
        var userSelectProperty = L.DomUtil.testProp(
            ['userSelect', 'WebkitUserSelect', 'OUserSelect', 'MozUserSelect', 'msUserSelect']);

        L.extend(L.DomUtil, {
            disableTextSelection: function () {
                if (userSelectProperty) {
                    var style = document.documentElement.style;
                    this._userSelect = style[userSelectProperty];
                    style[userSelectProperty] = 'none';
                }
            },

            enableTextSelection: function () {
                if (userSelectProperty) {
                    document.documentElement.style[userSelectProperty] = this._userSelect;
                    delete this._userSelect;
                }
            }
        });
    }

	L.extend(L.DomUtil, {
		disableImageDrag: function () {
			L.DomEvent.on(window, 'dragstart', L.DomEvent.preventDefault);
		},

		enableImageDrag: function () {
			L.DomEvent.off(window, 'dragstart', L.DomEvent.preventDefault);
		}
	});
})();


/*
 * L.LatLng represents a geographical point with latitude and longitude coordinates.
 */

L.LatLng = function (lat, lng, alt) { // (Number, Number, Number)
	lat = parseFloat(lat);
	lng = parseFloat(lng);

	if (isNaN(lat) || isNaN(lng)) {
		throw new Error('Invalid LatLng object: (' + lat + ', ' + lng + ')');
	}

	this.lat = lat;
	this.lng = lng;

	if (alt !== undefined) {
		this.alt = parseFloat(alt);
	}
};

L.extend(L.LatLng, {
	DEG_TO_RAD: Math.PI / 180,
	RAD_TO_DEG: 180 / Math.PI,
	MAX_MARGIN: 1.0E-9 // max margin of error for the "equals" check
});

L.LatLng.prototype = {
	equals: function (obj) { // (LatLng) -> Boolean
		if (!obj) { return false; }

		obj = L.latLng(obj);

		var margin = Math.max(
		        Math.abs(this.lat - obj.lat),
		        Math.abs(this.lng - obj.lng));

		return margin <= L.LatLng.MAX_MARGIN;
	},

	toString: function (precision) { // (Number) -> String
		return 'LatLng(' +
		        L.Util.formatNum(this.lat, precision) + ', ' +
		        L.Util.formatNum(this.lng, precision) + ')';
	},

	// Haversine distance formula, see http://en.wikipedia.org/wiki/Haversine_formula
	// TODO move to projection code, LatLng shouldn't know about Earth
	distanceTo: function (other) { // (LatLng) -> Number
		other = L.latLng(other);

		var R = 6378137, // earth radius in meters
		    d2r = L.LatLng.DEG_TO_RAD,
		    dLat = (other.lat - this.lat) * d2r,
		    dLon = (other.lng - this.lng) * d2r,
		    lat1 = this.lat * d2r,
		    lat2 = other.lat * d2r,
		    sin1 = Math.sin(dLat / 2),
		    sin2 = Math.sin(dLon / 2);

		var a = sin1 * sin1 + sin2 * sin2 * Math.cos(lat1) * Math.cos(lat2);

		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	},

	wrap: function (a, b) { // (Number, Number) -> LatLng
		var lng = this.lng;

		a = a || -180;
		b = b ||  180;

		lng = (lng + b) % (b - a) + (lng < a || lng === b ? b : a);

		return new L.LatLng(this.lat, lng);
	}
};

L.latLng = function (a, b) { // (LatLng) or ([Number, Number]) or (Number, Number)
	if (a instanceof L.LatLng) {
		return a;
	}
	if (L.Util.isArray(a)) {
		if (typeof a[0] === 'number' || typeof a[0] === 'string') {
			return new L.LatLng(a[0], a[1], a[2]);
		} else {
			return null;
		}
	}
	if (a === undefined || a === null) {
		return a;
	}
	if (typeof a === 'object' && 'lat' in a) {
		return new L.LatLng(a.lat, 'lng' in a ? a.lng : a.lon);
	}
	if (b === undefined) {
		return null;
	}
	return new L.LatLng(a, b);
};



/*
 * L.LatLngBounds represents a rectangular area on the map in geographical coordinates.
 */

L.LatLngBounds = function (southWest, northEast) { // (LatLng, LatLng) or (LatLng[])
	if (!southWest) { return; }

	var latlngs = northEast ? [southWest, northEast] : southWest;

	for (var i = 0, len = latlngs.length; i < len; i++) {
		this.extend(latlngs[i]);
	}
};

L.LatLngBounds.prototype = {
	// extend the bounds to contain the given point or bounds
	extend: function (obj) { // (LatLng) or (LatLngBounds)
		if (!obj) { return this; }

		var latLng = L.latLng(obj);
		if (latLng !== null) {
			obj = latLng;
		} else {
			obj = L.latLngBounds(obj);
		}

		if (obj instanceof L.LatLng) {
			if (!this._southWest && !this._northEast) {
				this._southWest = new L.LatLng(obj.lat, obj.lng);
				this._northEast = new L.LatLng(obj.lat, obj.lng);
			} else {
				this._southWest.lat = Math.min(obj.lat, this._southWest.lat);
				this._southWest.lng = Math.min(obj.lng, this._southWest.lng);

				this._northEast.lat = Math.max(obj.lat, this._northEast.lat);
				this._northEast.lng = Math.max(obj.lng, this._northEast.lng);
			}
		} else if (obj instanceof L.LatLngBounds) {
			this.extend(obj._southWest);
			this.extend(obj._northEast);
		}
		return this;
	},

	// extend the bounds by a percentage
	pad: function (bufferRatio) { // (Number) -> LatLngBounds
		var sw = this._southWest,
		    ne = this._northEast,
		    heightBuffer = Math.abs(sw.lat - ne.lat) * bufferRatio,
		    widthBuffer = Math.abs(sw.lng - ne.lng) * bufferRatio;

		return new L.LatLngBounds(
		        new L.LatLng(sw.lat - heightBuffer, sw.lng - widthBuffer),
		        new L.LatLng(ne.lat + heightBuffer, ne.lng + widthBuffer));
	},

	getCenter: function () { // -> LatLng
		return new L.LatLng(
		        (this._southWest.lat + this._northEast.lat) / 2,
		        (this._southWest.lng + this._northEast.lng) / 2);
	},

	getSouthWest: function () {
		return this._southWest;
	},

	getNorthEast: function () {
		return this._northEast;
	},

	getNorthWest: function () {
		return new L.LatLng(this.getNorth(), this.getWest());
	},

	getSouthEast: function () {
		return new L.LatLng(this.getSouth(), this.getEast());
	},

	getWest: function () {
		return this._southWest.lng;
	},

	getSouth: function () {
		return this._southWest.lat;
	},

	getEast: function () {
		return this._northEast.lng;
	},

	getNorth: function () {
		return this._northEast.lat;
	},

	contains: function (obj) { // (LatLngBounds) or (LatLng) -> Boolean
		if (typeof obj[0] === 'number' || obj instanceof L.LatLng) {
			obj = L.latLng(obj);
		} else {
			obj = L.latLngBounds(obj);
		}

		var sw = this._southWest,
		    ne = this._northEast,
		    sw2, ne2;

		if (obj instanceof L.LatLngBounds) {
			sw2 = obj.getSouthWest();
			ne2 = obj.getNorthEast();
		} else {
			sw2 = ne2 = obj;
		}

		return (sw2.lat >= sw.lat) && (ne2.lat <= ne.lat) &&
		       (sw2.lng >= sw.lng) && (ne2.lng <= ne.lng);
	},

	intersects: function (bounds) { // (LatLngBounds)
		bounds = L.latLngBounds(bounds);

		var sw = this._southWest,
		    ne = this._northEast,
		    sw2 = bounds.getSouthWest(),
		    ne2 = bounds.getNorthEast(),

		    latIntersects = (ne2.lat >= sw.lat) && (sw2.lat <= ne.lat),
		    lngIntersects = (ne2.lng >= sw.lng) && (sw2.lng <= ne.lng);

		return latIntersects && lngIntersects;
	},

	toBBoxString: function () {
		return [this.getWest(), this.getSouth(), this.getEast(), this.getNorth()].join(',');
	},

	equals: function (bounds) { // (LatLngBounds)
		if (!bounds) { return false; }

		bounds = L.latLngBounds(bounds);

		return this._southWest.equals(bounds.getSouthWest()) &&
		       this._northEast.equals(bounds.getNorthEast());
	},

	isValid: function () {
		return !!(this._southWest && this._northEast);
	}
};

//TODO International date line?

L.latLngBounds = function (a, b) { // (LatLngBounds) or (LatLng, LatLng)
	if (!a || a instanceof L.LatLngBounds) {
		return a;
	}
	return new L.LatLngBounds(a, b);
};


/*
 * L.Projection contains various geographical projections used by CRS classes.
 */

L.Projection = {};


/*
 * Spherical Mercator is the most popular map projection, used by EPSG:3857 CRS used by default.
 */

L.Projection.SphericalMercator = {
	MAX_LATITUDE: 85.0511287798,

	project: function (latlng) { // (LatLng) -> Point
		var d = L.LatLng.DEG_TO_RAD,
		    max = this.MAX_LATITUDE,
		    lat = Math.max(Math.min(max, latlng.lat), -max),
		    x = latlng.lng * d,
		    y = lat * d;

		y = Math.log(Math.tan((Math.PI / 4) + (y / 2)));

		return new L.Point(x, y);
	},

	unproject: function (point) { // (Point, Boolean) -> LatLng
		var d = L.LatLng.RAD_TO_DEG,
		    lng = point.x * d,
		    lat = (2 * Math.atan(Math.exp(point.y)) - (Math.PI / 2)) * d;

		return new L.LatLng(lat, lng);
	}
};


/*
 * Simple equirectangular (Plate Carree) projection, used by CRS like EPSG:4326 and Simple.
 */

L.Projection.LonLat = {
	project: function (latlng) {
		return new L.Point(latlng.lng, latlng.lat);
	},

	unproject: function (point) {
		return new L.LatLng(point.y, point.x);
	}
};


/*
 * L.CRS is a base object for all defined CRS (Coordinate Reference Systems) in Leaflet.
 */

L.CRS = {
	latLngToPoint: function (latlng, zoom) { // (LatLng, Number) -> Point
		var projectedPoint = this.projection.project(latlng),
		    scale = this.scale(zoom);

		return this.transformation._transform(projectedPoint, scale);
	},

	pointToLatLng: function (point, zoom) { // (Point, Number[, Boolean]) -> LatLng
		var scale = this.scale(zoom),
		    untransformedPoint = this.transformation.untransform(point, scale);

		return this.projection.unproject(untransformedPoint);
	},

	project: function (latlng) {
		return this.projection.project(latlng);
	},

	scale: function (zoom) {
		return 256 * Math.pow(2, zoom);
	},

	getSize: function (zoom) {
		var s = this.scale(zoom);
		return L.point(s, s);
	}
};


/*
 * A simple CRS that can be used for flat non-Earth maps like panoramas or game maps.
 */

L.CRS.Simple = L.extend({}, L.CRS, {
	projection: L.Projection.LonLat,
	transformation: new L.Transformation(1, 0, -1, 0),

	scale: function (zoom) {
		return Math.pow(2, zoom);
	}
});


/*
 * L.CRS.EPSG3857 (Spherical Mercator) is the most common CRS for web mapping
 * and is used by Leaflet by default.
 */

L.CRS.EPSG3857 = L.extend({}, L.CRS, {
	code: 'EPSG:3857',

	projection: L.Projection.SphericalMercator,
	transformation: new L.Transformation(0.5 / Math.PI, 0.5, -0.5 / Math.PI, 0.5),

	project: function (latlng) { // (LatLng) -> Point
		var projectedPoint = this.projection.project(latlng),
		    earthRadius = 6378137;
		return projectedPoint.multiplyBy(earthRadius);
	}
});

L.CRS.EPSG900913 = L.extend({}, L.CRS.EPSG3857, {
	code: 'EPSG:900913'
});


/*
 * L.CRS.EPSG4326 is a CRS popular among advanced GIS specialists.
 */

L.CRS.EPSG4326 = L.extend({}, L.CRS, {
	code: 'EPSG:4326',

	projection: L.Projection.LonLat,
	transformation: new L.Transformation(1 / 360, 0.5, -1 / 360, 0.5)
});


/*
 * L.Map is the central class of the API - it is used to create a map.
 */

L.Map = L.Class.extend({

	includes: L.Mixin.Events,

	options: {
		crs: L.CRS.EPSG3857,

		/*
		center: LatLng,
		zoom: Number,
		layers: Array,
		*/

		fadeAnimation: L.DomUtil.TRANSITION && !L.Browser.android23,
		trackResize: true,
		markerZoomAnimation: L.DomUtil.TRANSITION && L.Browser.any3d
	},

	initialize: function (id, options) { // (HTMLElement or String, Object)
		options = L.setOptions(this, options);


		this._initContainer(id);
		this._initLayout();

		// hack for https://github.com/Leaflet/Leaflet/issues/1980
		this._onResize = L.bind(this._onResize, this);

		this._initEvents();

		if (options.maxBounds) {
			this.setMaxBounds(options.maxBounds);
		}

		if (options.center && options.zoom !== undefined) {
			this.setView(L.latLng(options.center), options.zoom, {reset: true});
		}

		this._handlers = [];

		this._layers = {};
		this._zoomBoundLayers = {};
		this._tileLayersNum = 0;

		this.callInitHooks();

		this._addLayers(options.layers);
	},


	// public methods that modify map state

	// replaced by animation-powered implementation in Map.PanAnimation.js
	setView: function (center, zoom) {
		zoom = zoom === undefined ? this.getZoom() : zoom;
		this._resetView(L.latLng(center), this._limitZoom(zoom));
		return this;
	},

	setZoom: function (zoom, options) {
		if (!this._loaded) {
			this._zoom = this._limitZoom(zoom);
			return this;
		}
		return this.setView(this.getCenter(), zoom, {zoom: options});
	},

	zoomIn: function (delta, options) {
		return this.setZoom(this._zoom + (delta || 1), options);
	},

	zoomOut: function (delta, options) {
		return this.setZoom(this._zoom - (delta || 1), options);
	},

	setZoomAround: function (latlng, zoom, options) {
		var scale = this.getZoomScale(zoom),
		    viewHalf = this.getSize().divideBy(2),
		    containerPoint = latlng instanceof L.Point ? latlng : this.latLngToContainerPoint(latlng),

		    centerOffset = containerPoint.subtract(viewHalf).multiplyBy(1 - 1 / scale),
		    newCenter = this.containerPointToLatLng(viewHalf.add(centerOffset));

		return this.setView(newCenter, zoom, {zoom: options});
	},

	fitBounds: function (bounds, options) {

		options = options || {};
		bounds = bounds.getBounds ? bounds.getBounds() : L.latLngBounds(bounds);

		var paddingTL = L.point(options.paddingTopLeft || options.padding || [0, 0]),
		    paddingBR = L.point(options.paddingBottomRight || options.padding || [0, 0]),

		    zoom = this.getBoundsZoom(bounds, false, paddingTL.add(paddingBR));

		zoom = (options.maxZoom) ? Math.min(options.maxZoom, zoom) : zoom;

		var paddingOffset = paddingBR.subtract(paddingTL).divideBy(2),

		    swPoint = this.project(bounds.getSouthWest(), zoom),
		    nePoint = this.project(bounds.getNorthEast(), zoom),
		    center = this.unproject(swPoint.add(nePoint).divideBy(2).add(paddingOffset), zoom);

		return this.setView(center, zoom, options);
	},

	fitWorld: function (options) {
		return this.fitBounds([[-90, -180], [90, 180]], options);
	},

	panTo: function (center, options) { // (LatLng)
		return this.setView(center, this._zoom, {pan: options});
	},

	panBy: function (offset) { // (Point)
		// replaced with animated panBy in Map.PanAnimation.js
		this.fire('movestart');

		this._rawPanBy(L.point(offset));

		this.fire('move');
		return this.fire('moveend');
	},

	setMaxBounds: function (bounds) {
		bounds = L.latLngBounds(bounds);

		this.options.maxBounds = bounds;

		if (!bounds) {
			return this.off('moveend', this._panInsideMaxBounds, this);
		}

		if (this._loaded) {
			this._panInsideMaxBounds();
		}

		return this.on('moveend', this._panInsideMaxBounds, this);
	},

	panInsideBounds: function (bounds, options) {
		var center = this.getCenter(),
			newCenter = this._limitCenter(center, this._zoom, bounds);

		if (center.equals(newCenter)) { return this; }

		return this.panTo(newCenter, options);
	},

	addLayer: function (layer) {
		// TODO method is too big, refactor

		var id = L.stamp(layer);

		if (this._layers[id]) { return this; }

		this._layers[id] = layer;

		// TODO getMaxZoom, getMinZoom in ILayer (instead of options)
		if (layer.options && (!isNaN(layer.options.maxZoom) || !isNaN(layer.options.minZoom))) {
			this._zoomBoundLayers[id] = layer;
			this._updateZoomLevels();
		}

		// TODO looks ugly, refactor!!!
		if (this.options.zoomAnimation && L.TileLayer && (layer instanceof L.TileLayer)) {
			this._tileLayersNum++;
			this._tileLayersToLoad++;
			layer.on('load', this._onTileLayerLoad, this);
		}

		if (this._loaded) {
			this._layerAdd(layer);
		}

		return this;
	},

	removeLayer: function (layer) {
		var id = L.stamp(layer);

		if (!this._layers[id]) { return this; }

		if (this._loaded) {
			layer.onRemove(this);
		}

		delete this._layers[id];

		if (this._loaded) {
			this.fire('layerremove', {layer: layer});
		}

		if (this._zoomBoundLayers[id]) {
			delete this._zoomBoundLayers[id];
			this._updateZoomLevels();
		}

		// TODO looks ugly, refactor
		if (this.options.zoomAnimation && L.TileLayer && (layer instanceof L.TileLayer)) {
			this._tileLayersNum--;
			this._tileLayersToLoad--;
			layer.off('load', this._onTileLayerLoad, this);
		}

		return this;
	},

	hasLayer: function (layer) {
		if (!layer) { return false; }

		return (L.stamp(layer) in this._layers);
	},

	eachLayer: function (method, context) {
		for (var i in this._layers) {
			method.call(context, this._layers[i]);
		}
		return this;
	},

	invalidateSize: function (options) {
		if (!this._loaded) { return this; }

		options = L.extend({
			animate: false,
			pan: true
		}, options === true ? {animate: true} : options);

		var oldSize = this.getSize();
		this._sizeChanged = true;
		this._initialCenter = null;

		var newSize = this.getSize(),
		    oldCenter = oldSize.divideBy(2).round(),
		    newCenter = newSize.divideBy(2).round(),
		    offset = oldCenter.subtract(newCenter);

		if (!offset.x && !offset.y) { return this; }

		if (options.animate && options.pan) {
			this.panBy(offset);

		} else {
			if (options.pan) {
				this._rawPanBy(offset);
			}

			this.fire('move');

			if (options.debounceMoveend) {
				clearTimeout(this._sizeTimer);
				this._sizeTimer = setTimeout(L.bind(this.fire, this, 'moveend'), 200);
			} else {
				this.fire('moveend');
			}
		}

		return this.fire('resize', {
			oldSize: oldSize,
			newSize: newSize
		});
	},

	// TODO handler.addTo
	addHandler: function (name, HandlerClass) {
		if (!HandlerClass) { return this; }

		var handler = this[name] = new HandlerClass(this);

		this._handlers.push(handler);

		if (this.options[name]) {
			handler.enable();
		}

		return this;
	},

	remove: function () {
		if (this._loaded) {
			this.fire('unload');
		}

		this._initEvents('off');

		try {
			// throws error in IE6-8
			delete this._container._leaflet;
		} catch (e) {
			this._container._leaflet = undefined;
		}

		this._clearPanes();
		if (this._clearControlPos) {
			this._clearControlPos();
		}

		this._clearHandlers();

		return this;
	},


	// public methods for getting map state

	getCenter: function () { // (Boolean) -> LatLng
		this._checkIfLoaded();

		if (this._initialCenter && !this._moved()) {
			return this._initialCenter;
		}
		return this.layerPointToLatLng(this._getCenterLayerPoint());
	},

	getZoom: function () {
		return this._zoom;
	},

	getBounds: function () {
		var bounds = this.getPixelBounds(),
		    sw = this.unproject(bounds.getBottomLeft()),
		    ne = this.unproject(bounds.getTopRight());

		return new L.LatLngBounds(sw, ne);
	},

	getMinZoom: function () {
		return this.options.minZoom === undefined ?
			(this._layersMinZoom === undefined ? 0 : this._layersMinZoom) :
			this.options.minZoom;
	},

	getMaxZoom: function () {
		return this.options.maxZoom === undefined ?
			(this._layersMaxZoom === undefined ? Infinity : this._layersMaxZoom) :
			this.options.maxZoom;
	},

	getBoundsZoom: function (bounds, inside, padding) { // (LatLngBounds[, Boolean, Point]) -> Number
		bounds = L.latLngBounds(bounds);

		var zoom = this.getMinZoom() - (inside ? 1 : 0),
		    maxZoom = this.getMaxZoom(),
		    size = this.getSize(),

		    nw = bounds.getNorthWest(),
		    se = bounds.getSouthEast(),

		    zoomNotFound = true,
		    boundsSize;

		padding = L.point(padding || [0, 0]);

		do {
			zoom++;
			boundsSize = this.project(se, zoom).subtract(this.project(nw, zoom)).add(padding);
			zoomNotFound = !inside ? size.contains(boundsSize) : boundsSize.x < size.x || boundsSize.y < size.y;

		} while (zoomNotFound && zoom <= maxZoom);

		if (zoomNotFound && inside) {
			return null;
		}

		return inside ? zoom : zoom - 1;
	},

	getSize: function () {
		if (!this._size || this._sizeChanged) {
			this._size = new L.Point(
				this._container.clientWidth,
				this._container.clientHeight);

			this._sizeChanged = false;
		}
		return this._size.clone();
	},

	getPixelBounds: function () {
		var topLeftPoint = this._getTopLeftPoint();
		return new L.Bounds(topLeftPoint, topLeftPoint.add(this.getSize()));
	},

	getPixelOrigin: function () {
		this._checkIfLoaded();
		return this._initialTopLeftPoint;
	},

	getPanes: function () {
		return this._panes;
	},

	getContainer: function () {
		return this._container;
	},


	// TODO replace with universal implementation after refactoring projections

	getZoomScale: function (toZoom) {
		var crs = this.options.crs;
		return crs.scale(toZoom) / crs.scale(this._zoom);
	},

	getScaleZoom: function (scale) {
		return this._zoom + (Math.log(scale) / Math.LN2);
	},


	// conversion methods

	project: function (latlng, zoom) { // (LatLng[, Number]) -> Point
		zoom = zoom === undefined ? this._zoom : zoom;
		return this.options.crs.latLngToPoint(L.latLng(latlng), zoom);
	},

	unproject: function (point, zoom) { // (Point[, Number]) -> LatLng
		zoom = zoom === undefined ? this._zoom : zoom;
		return this.options.crs.pointToLatLng(L.point(point), zoom);
	},

	layerPointToLatLng: function (point) { // (Point)
		var projectedPoint = L.point(point).add(this.getPixelOrigin());
		return this.unproject(projectedPoint);
	},

	latLngToLayerPoint: function (latlng) { // (LatLng)
		var projectedPoint = this.project(L.latLng(latlng))._round();
		return projectedPoint._subtract(this.getPixelOrigin());
	},

	containerPointToLayerPoint: function (point) { // (Point)
		return L.point(point).subtract(this._getMapPanePos());
	},

	layerPointToContainerPoint: function (point) { // (Point)
		return L.point(point).add(this._getMapPanePos());
	},

	containerPointToLatLng: function (point) {
		var layerPoint = this.containerPointToLayerPoint(L.point(point));
		return this.layerPointToLatLng(layerPoint);
	},

	latLngToContainerPoint: function (latlng) {
		return this.layerPointToContainerPoint(this.latLngToLayerPoint(L.latLng(latlng)));
	},

	mouseEventToContainerPoint: function (e) { // (MouseEvent)
		return L.DomEvent.getMousePosition(e, this._container);
	},

	mouseEventToLayerPoint: function (e) { // (MouseEvent)
		return this.containerPointToLayerPoint(this.mouseEventToContainerPoint(e));
	},

	mouseEventToLatLng: function (e) { // (MouseEvent)
		return this.layerPointToLatLng(this.mouseEventToLayerPoint(e));
	},


	// map initialization methods

	_initContainer: function (id) {
		var container = this._container = L.DomUtil.get(id);

		if (!container) {
			throw new Error('Map container not found.');
		} else if (container._leaflet) {
			throw new Error('Map container is already initialized.');
		}

		container._leaflet = true;
	},

	_initLayout: function () {
		var container = this._container;

		L.DomUtil.addClass(container, 'leaflet-container' +
			(L.Browser.touch ? ' leaflet-touch' : '') +
			(L.Browser.retina ? ' leaflet-retina' : '') +
			(L.Browser.ielt9 ? ' leaflet-oldie' : '') +
			(this.options.fadeAnimation ? ' leaflet-fade-anim' : ''));

		var position = L.DomUtil.getStyle(container, 'position');

		if (position !== 'absolute' && position !== 'relative' && position !== 'fixed') {
			container.style.position = 'relative';
		}

		this._initPanes();

		if (this._initControlPos) {
			this._initControlPos();
		}
	},

	_initPanes: function () {
		var panes = this._panes = {};

		this._mapPane = panes.mapPane = this._createPane('leaflet-map-pane', this._container);

		this._tilePane = panes.tilePane = this._createPane('leaflet-tile-pane', this._mapPane);
		panes.objectsPane = this._createPane('leaflet-objects-pane', this._mapPane);
		panes.shadowPane = this._createPane('leaflet-shadow-pane');
		panes.overlayPane = this._createPane('leaflet-overlay-pane');
		panes.markerPane = this._createPane('leaflet-marker-pane');
		panes.popupPane = this._createPane('leaflet-popup-pane');

		var zoomHide = ' leaflet-zoom-hide';

		if (!this.options.markerZoomAnimation) {
			L.DomUtil.addClass(panes.markerPane, zoomHide);
			L.DomUtil.addClass(panes.shadowPane, zoomHide);
			L.DomUtil.addClass(panes.popupPane, zoomHide);
		}
	},

	_createPane: function (className, container) {
		return L.DomUtil.create('div', className, container || this._panes.objectsPane);
	},

	_clearPanes: function () {
		this._container.removeChild(this._mapPane);
	},

	_addLayers: function (layers) {
		layers = layers ? (L.Util.isArray(layers) ? layers : [layers]) : [];

		for (var i = 0, len = layers.length; i < len; i++) {
			this.addLayer(layers[i]);
		}
	},


	// private methods that modify map state

	_resetView: function (center, zoom, preserveMapOffset, afterZoomAnim) {

		var zoomChanged = (this._zoom !== zoom);

		if (!afterZoomAnim) {
			this.fire('movestart');

			if (zoomChanged) {
				this.fire('zoomstart');
			}
		}

		this._zoom = zoom;
		this._initialCenter = center;

		this._initialTopLeftPoint = this._getNewTopLeftPoint(center);

		if (!preserveMapOffset) {
			L.DomUtil.setPosition(this._mapPane, new L.Point(0, 0));
		} else {
			this._initialTopLeftPoint._add(this._getMapPanePos());
		}

		this._tileLayersToLoad = this._tileLayersNum;

		var loading = !this._loaded;
		this._loaded = true;

		this.fire('viewreset', {hard: !preserveMapOffset});

		if (loading) {
			this.fire('load');
			this.eachLayer(this._layerAdd, this);
		}

		this.fire('move');

		if (zoomChanged || afterZoomAnim) {
			this.fire('zoomend');
		}

		this.fire('moveend', {hard: !preserveMapOffset});
	},

	_rawPanBy: function (offset) {
		L.DomUtil.setPosition(this._mapPane, this._getMapPanePos().subtract(offset));
	},

	_getZoomSpan: function () {
		return this.getMaxZoom() - this.getMinZoom();
	},

	_updateZoomLevels: function () {
		var i,
			minZoom = Infinity,
			maxZoom = -Infinity,
			oldZoomSpan = this._getZoomSpan();

		for (i in this._zoomBoundLayers) {
			var layer = this._zoomBoundLayers[i];
			if (!isNaN(layer.options.minZoom)) {
				minZoom = Math.min(minZoom, layer.options.minZoom);
			}
			if (!isNaN(layer.options.maxZoom)) {
				maxZoom = Math.max(maxZoom, layer.options.maxZoom);
			}
		}

		if (i === undefined) { // we have no tilelayers
			this._layersMaxZoom = this._layersMinZoom = undefined;
		} else {
			this._layersMaxZoom = maxZoom;
			this._layersMinZoom = minZoom;
		}

		if (oldZoomSpan !== this._getZoomSpan()) {
			this.fire('zoomlevelschange');
		}
	},

	_panInsideMaxBounds: function () {
		this.panInsideBounds(this.options.maxBounds);
	},

	_checkIfLoaded: function () {
		if (!this._loaded) {
			throw new Error('Set map center and zoom first.');
		}
	},

	// map events

	_initEvents: function (onOff) {
		if (!L.DomEvent) { return; }

		onOff = onOff || 'on';

		L.DomEvent[onOff](this._container, 'click', this._onMouseClick, this);

		var events = ['dblclick', 'mousedown', 'mouseup', 'mouseenter',
		              'mouseleave', 'mousemove', 'contextmenu'],
		    i, len;

		for (i = 0, len = events.length; i < len; i++) {
			L.DomEvent[onOff](this._container, events[i], this._fireMouseEvent, this);
		}

		if (this.options.trackResize) {
			L.DomEvent[onOff](window, 'resize', this._onResize, this);
		}
	},

	_onResize: function () {
		L.Util.cancelAnimFrame(this._resizeRequest);
		this._resizeRequest = L.Util.requestAnimFrame(
		        function () { this.invalidateSize({debounceMoveend: true}); }, this, false, this._container);
	},

	_onMouseClick: function (e) {
		if (!this._loaded || (!e._simulated &&
		        ((this.dragging && this.dragging.moved()) ||
		         (this.boxZoom  && this.boxZoom.moved()))) ||
		            L.DomEvent._skipped(e)) { return; }

		this.fire('preclick');
		this._fireMouseEvent(e);
	},

	_fireMouseEvent: function (e) {
		if (!this._loaded || L.DomEvent._skipped(e)) { return; }

		var type = e.type;

		type = (type === 'mouseenter' ? 'mouseover' : (type === 'mouseleave' ? 'mouseout' : type));

		if (!this.hasEventListeners(type)) { return; }

		if (type === 'contextmenu') {
			L.DomEvent.preventDefault(e);
		}

		var containerPoint = this.mouseEventToContainerPoint(e),
		    layerPoint = this.containerPointToLayerPoint(containerPoint),
		    latlng = this.layerPointToLatLng(layerPoint);

		this.fire(type, {
			latlng: latlng,
			layerPoint: layerPoint,
			containerPoint: containerPoint,
			originalEvent: e
		});
	},

	_onTileLayerLoad: function () {
		this._tileLayersToLoad--;
		if (this._tileLayersNum && !this._tileLayersToLoad) {
			this.fire('tilelayersload');
		}
	},

	_clearHandlers: function () {
		for (var i = 0, len = this._handlers.length; i < len; i++) {
			this._handlers[i].disable();
		}
	},

	whenReady: function (callback, context) {
		if (this._loaded) {
			callback.call(context || this, this);
		} else {
			this.on('load', callback, context);
		}
		return this;
	},

	_layerAdd: function (layer) {
		layer.onAdd(this);
		this.fire('layeradd', {layer: layer});
	},


	// private methods for getting map state

	_getMapPanePos: function () {
		return L.DomUtil.getPosition(this._mapPane);
	},

	_moved: function () {
		var pos = this._getMapPanePos();
		return pos && !pos.equals([0, 0]);
	},

	_getTopLeftPoint: function () {
		return this.getPixelOrigin().subtract(this._getMapPanePos());
	},

	_getNewTopLeftPoint: function (center, zoom) {
		var viewHalf = this.getSize()._divideBy(2);
		// TODO round on display, not calculation to increase precision?
		return this.project(center, zoom)._subtract(viewHalf)._round();
	},

	_latLngToNewLayerPoint: function (latlng, newZoom, newCenter) {
		var topLeft = this._getNewTopLeftPoint(newCenter, newZoom).add(this._getMapPanePos());
		return this.project(latlng, newZoom)._subtract(topLeft);
	},

	// layer point of the current center
	_getCenterLayerPoint: function () {
		return this.containerPointToLayerPoint(this.getSize()._divideBy(2));
	},

	// offset of the specified place to the current center in pixels
	_getCenterOffset: function (latlng) {
		return this.latLngToLayerPoint(latlng).subtract(this._getCenterLayerPoint());
	},

	// adjust center for view to get inside bounds
	_limitCenter: function (center, zoom, bounds) {

		if (!bounds) { return center; }

		var centerPoint = this.project(center, zoom),
		    viewHalf = this.getSize().divideBy(2),
		    viewBounds = new L.Bounds(centerPoint.subtract(viewHalf), centerPoint.add(viewHalf)),
		    offset = this._getBoundsOffset(viewBounds, bounds, zoom);

		return this.unproject(centerPoint.add(offset), zoom);
	},

	// adjust offset for view to get inside bounds
	_limitOffset: function (offset, bounds) {
		if (!bounds) { return offset; }

		var viewBounds = this.getPixelBounds(),
		    newBounds = new L.Bounds(viewBounds.min.add(offset), viewBounds.max.add(offset));

		return offset.add(this._getBoundsOffset(newBounds, bounds));
	},

	// returns offset needed for pxBounds to get inside maxBounds at a specified zoom
	_getBoundsOffset: function (pxBounds, maxBounds, zoom) {
		var nwOffset = this.project(maxBounds.getNorthWest(), zoom).subtract(pxBounds.min),
		    seOffset = this.project(maxBounds.getSouthEast(), zoom).subtract(pxBounds.max),

		    dx = this._rebound(nwOffset.x, -seOffset.x),
		    dy = this._rebound(nwOffset.y, -seOffset.y);

		return new L.Point(dx, dy);
	},

	_rebound: function (left, right) {
		return left + right > 0 ?
			Math.round(left - right) / 2 :
			Math.max(0, Math.ceil(left)) - Math.max(0, Math.floor(right));
	},

	_limitZoom: function (zoom) {
		var min = this.getMinZoom(),
		    max = this.getMaxZoom();

		return Math.max(min, Math.min(max, zoom));
	}
});

L.map = function (id, options) {
	return new L.Map(id, options);
};


/*
 * Mercator projection that takes into account that the Earth is not a perfect sphere.
 * Less popular than spherical mercator; used by projections like EPSG:3395.
 */

L.Projection.Mercator = {
	MAX_LATITUDE: 85.0840591556,

	R_MINOR: 6356752.314245179,
	R_MAJOR: 6378137,

	project: function (latlng) { // (LatLng) -> Point
		var d = L.LatLng.DEG_TO_RAD,
		    max = this.MAX_LATITUDE,
		    lat = Math.max(Math.min(max, latlng.lat), -max),
		    r = this.R_MAJOR,
		    r2 = this.R_MINOR,
		    x = latlng.lng * d * r,
		    y = lat * d,
		    tmp = r2 / r,
		    eccent = Math.sqrt(1.0 - tmp * tmp),
		    con = eccent * Math.sin(y);

		con = Math.pow((1 - con) / (1 + con), eccent * 0.5);

		var ts = Math.tan(0.5 * ((Math.PI * 0.5) - y)) / con;
		y = -r * Math.log(ts);

		return new L.Point(x, y);
	},

	unproject: function (point) { // (Point, Boolean) -> LatLng
		var d = L.LatLng.RAD_TO_DEG,
		    r = this.R_MAJOR,
		    r2 = this.R_MINOR,
		    lng = point.x * d / r,
		    tmp = r2 / r,
		    eccent = Math.sqrt(1 - (tmp * tmp)),
		    ts = Math.exp(- point.y / r),
		    phi = (Math.PI / 2) - 2 * Math.atan(ts),
		    numIter = 15,
		    tol = 1e-7,
		    i = numIter,
		    dphi = 0.1,
		    con;

		while ((Math.abs(dphi) > tol) && (--i > 0)) {
			con = eccent * Math.sin(phi);
			dphi = (Math.PI / 2) - 2 * Math.atan(ts *
			            Math.pow((1.0 - con) / (1.0 + con), 0.5 * eccent)) - phi;
			phi += dphi;
		}

		return new L.LatLng(phi * d, lng);
	}
};



L.CRS.EPSG3395 = L.extend({}, L.CRS, {
	code: 'EPSG:3395',

	projection: L.Projection.Mercator,

	transformation: (function () {
		var m = L.Projection.Mercator,
		    r = m.R_MAJOR,
		    scale = 0.5 / (Math.PI * r);

		return new L.Transformation(scale, 0.5, -scale, 0.5);
	}())
});


/*
 * L.TileLayer is used for standard xyz-numbered tile layers.
 */

L.TileLayer = L.Class.extend({
	includes: L.Mixin.Events,

	options: {
		minZoom: 0,
		maxZoom: 18,
		tileSize: 256,
		subdomains: 'abc',
		errorTileUrl: '',
		attribution: '',
		zoomOffset: 0,
		opacity: 1,
		/*
		maxNativeZoom: null,
		zIndex: null,
		tms: false,
		continuousWorld: false,
		noWrap: false,
		zoomReverse: false,
		detectRetina: false,
		reuseTiles: false,
		bounds: false,
		*/
		unloadInvisibleTiles: L.Browser.mobile,
		updateWhenIdle: L.Browser.mobile
	},

	initialize: function (url, options) {
		options = L.setOptions(this, options);

		// detecting retina displays, adjusting tileSize and zoom levels
		if (options.detectRetina && L.Browser.retina && options.maxZoom > 0) {

			options.tileSize = Math.floor(options.tileSize / 2);
			options.zoomOffset++;

			if (options.minZoom > 0) {
				options.minZoom--;
			}
			this.options.maxZoom--;
		}

		if (options.bounds) {
			options.bounds = L.latLngBounds(options.bounds);
		}

		this._url = url;

		var subdomains = this.options.subdomains;

		if (typeof subdomains === 'string') {
			this.options.subdomains = subdomains.split('');
		}
	},

	onAdd: function (map) {
		this._map = map;
		this._animated = map._zoomAnimated;

		// create a container div for tiles
		this._initContainer();

		// set up events
		map.on({
			'viewreset': this._reset,
			'moveend': this._update
		}, this);

		if (this._animated) {
			map.on({
				'zoomanim': this._animateZoom,
				'zoomend': this._endZoomAnim
			}, this);
		}

		if (!this.options.updateWhenIdle) {
			this._limitedUpdate = L.Util.limitExecByInterval(this._update, 150, this);
			map.on('move', this._limitedUpdate, this);
		}

		this._reset();
		this._update();
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	onRemove: function (map) {
		this._container.parentNode.removeChild(this._container);

		map.off({
			'viewreset': this._reset,
			'moveend': this._update
		}, this);

		if (this._animated) {
			map.off({
				'zoomanim': this._animateZoom,
				'zoomend': this._endZoomAnim
			}, this);
		}

		if (!this.options.updateWhenIdle) {
			map.off('move', this._limitedUpdate, this);
		}

		this._container = null;
		this._map = null;
	},

	bringToFront: function () {
		var pane = this._map._panes.tilePane;

		if (this._container) {
			pane.appendChild(this._container);
			this._setAutoZIndex(pane, Math.max);
		}

		return this;
	},

	bringToBack: function () {
		var pane = this._map._panes.tilePane;

		if (this._container) {
			pane.insertBefore(this._container, pane.firstChild);
			this._setAutoZIndex(pane, Math.min);
		}

		return this;
	},

	getAttribution: function () {
		return this.options.attribution;
	},

	getContainer: function () {
		return this._container;
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;

		if (this._map) {
			this._updateOpacity();
		}

		return this;
	},

	setZIndex: function (zIndex) {
		this.options.zIndex = zIndex;
		this._updateZIndex();

		return this;
	},

	setUrl: function (url, noRedraw) {
		this._url = url;

		if (!noRedraw) {
			this.redraw();
		}

		return this;
	},

	redraw: function () {
		if (this._map) {
			this._reset({hard: true});
			this._update();
		}
		return this;
	},

	_updateZIndex: function () {
		if (this._container && this.options.zIndex !== undefined) {
			this._container.style.zIndex = this.options.zIndex;
		}
	},

	_setAutoZIndex: function (pane, compare) {

		var layers = pane.children,
		    edgeZIndex = -compare(Infinity, -Infinity), // -Infinity for max, Infinity for min
		    zIndex, i, len;

		for (i = 0, len = layers.length; i < len; i++) {

			if (layers[i] !== this._container) {
				zIndex = parseInt(layers[i].style.zIndex, 10);

				if (!isNaN(zIndex)) {
					edgeZIndex = compare(edgeZIndex, zIndex);
				}
			}
		}

		this.options.zIndex = this._container.style.zIndex =
		        (isFinite(edgeZIndex) ? edgeZIndex : 0) + compare(1, -1);
	},

	_updateOpacity: function () {
		var i,
		    tiles = this._tiles;

		if (L.Browser.ielt9) {
			for (i in tiles) {
				L.DomUtil.setOpacity(tiles[i], this.options.opacity);
			}
		} else {
			L.DomUtil.setOpacity(this._container, this.options.opacity);
		}
	},

	_initContainer: function () {
		var tilePane = this._map._panes.tilePane;

		if (!this._container) {
			this._container = L.DomUtil.create('div', 'leaflet-layer');

			this._updateZIndex();

			if (this._animated) {
				var className = 'leaflet-tile-container';

				this._bgBuffer = L.DomUtil.create('div', className, this._container);
				this._tileContainer = L.DomUtil.create('div', className, this._container);

			} else {
				this._tileContainer = this._container;
			}

			tilePane.appendChild(this._container);

			if (this.options.opacity < 1) {
				this._updateOpacity();
			}
		}
	},

	_reset: function (e) {
		for (var key in this._tiles) {
			this.fire('tileunload', {tile: this._tiles[key]});
		}

		this._tiles = {};
		this._tilesToLoad = 0;

		if (this.options.reuseTiles) {
			this._unusedTiles = [];
		}

		this._tileContainer.innerHTML = '';

		if (this._animated && e && e.hard) {
			this._clearBgBuffer();
		}

		this._initContainer();
	},

	_getTileSize: function () {
		var map = this._map,
		    zoom = map.getZoom() + this.options.zoomOffset,
		    zoomN = this.options.maxNativeZoom,
		    tileSize = this.options.tileSize;

		if (zoomN && zoom > zoomN) {
			tileSize = Math.round(map.getZoomScale(zoom) / map.getZoomScale(zoomN) * tileSize);
		}

		return tileSize;
	},

	_update: function () {

		if (!this._map) { return; }

		var map = this._map,
		    bounds = map.getPixelBounds(),
		    zoom = map.getZoom(),
		    tileSize = this._getTileSize();

		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			return;
		}

		var tileBounds = L.bounds(
		        bounds.min.divideBy(tileSize)._floor(),
		        bounds.max.divideBy(tileSize)._floor());

		this._addTilesFromCenterOut(tileBounds);

		if (this.options.unloadInvisibleTiles || this.options.reuseTiles) {
			this._removeOtherTiles(tileBounds);
		}
	},

	_addTilesFromCenterOut: function (bounds) {
		var queue = [],
		    center = bounds.getCenter();

		var j, i, point;

		for (j = bounds.min.y; j <= bounds.max.y; j++) {
			for (i = bounds.min.x; i <= bounds.max.x; i++) {
				point = new L.Point(i, j);

				if (this._tileShouldBeLoaded(point)) {
					queue.push(point);
				}
			}
		}

		var tilesToLoad = queue.length;

		if (tilesToLoad === 0) { return; }

		// load tiles in order of their distance to center
		queue.sort(function (a, b) {
			return a.distanceTo(center) - b.distanceTo(center);
		});

		var fragment = document.createDocumentFragment();

		// if its the first batch of tiles to load
		if (!this._tilesToLoad) {
			this.fire('loading');
		}

		this._tilesToLoad += tilesToLoad;

		for (i = 0; i < tilesToLoad; i++) {
			this._addTile(queue[i], fragment);
		}

		this._tileContainer.appendChild(fragment);
	},

	_tileShouldBeLoaded: function (tilePoint) {
		if ((tilePoint.x + ':' + tilePoint.y) in this._tiles) {
			return false; // already loaded
		}

		var options = this.options;

		if (!options.continuousWorld) {
			var limit = this._getWrapTileNum();

			// don't load if exceeds world bounds
			if ((options.noWrap && (tilePoint.x < 0 || tilePoint.x >= limit.x)) ||
				tilePoint.y < 0 || tilePoint.y >= limit.y) { return false; }
		}

		if (options.bounds) {
			var tileSize = this._getTileSize(),
			    nwPoint = tilePoint.multiplyBy(tileSize),
			    sePoint = nwPoint.add([tileSize, tileSize]),
			    nw = this._map.unproject(nwPoint),
			    se = this._map.unproject(sePoint);

			// TODO temporary hack, will be removed after refactoring projections
			// https://github.com/Leaflet/Leaflet/issues/1618
			if (!options.continuousWorld && !options.noWrap) {
				nw = nw.wrap();
				se = se.wrap();
			}

			if (!options.bounds.intersects([nw, se])) { return false; }
		}

		return true;
	},

	_removeOtherTiles: function (bounds) {
		var kArr, x, y, key;

		for (key in this._tiles) {
			kArr = key.split(':');
			x = parseInt(kArr[0], 10);
			y = parseInt(kArr[1], 10);

			// remove tile if it's out of bounds
			if (x < bounds.min.x || x > bounds.max.x || y < bounds.min.y || y > bounds.max.y) {
				this._removeTile(key);
			}
		}
	},

	_removeTile: function (key) {
		var tile = this._tiles[key];

		this.fire('tileunload', {tile: tile, url: tile.src});

		if (this.options.reuseTiles) {
			L.DomUtil.removeClass(tile, 'leaflet-tile-loaded');
			this._unusedTiles.push(tile);

		} else if (tile.parentNode === this._tileContainer) {
			this._tileContainer.removeChild(tile);
		}

		// for https://github.com/CloudMade/Leaflet/issues/137
		if (!L.Browser.android) {
			tile.onload = null;
			tile.src = L.Util.emptyImageUrl;
		}

		delete this._tiles[key];
	},

	_addTile: function (tilePoint, container) {
		var tilePos = this._getTilePos(tilePoint);

		// get unused tile - or create a new tile
		var tile = this._getTile();

		/*
		Chrome 20 layouts much faster with top/left (verify with timeline, frames)
		Android 4 browser has display issues with top/left and requires transform instead
		(other browsers don't currently care) - see debug/hacks/jitter.html for an example
		*/
		L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome);

		this._tiles[tilePoint.x + ':' + tilePoint.y] = tile;

		this._loadTile(tile, tilePoint);

		if (tile.parentNode !== this._tileContainer) {
			container.appendChild(tile);
		}
	},

	_getZoomForUrl: function () {

		var options = this.options,
		    zoom = this._map.getZoom();

		if (options.zoomReverse) {
			zoom = options.maxZoom - zoom;
		}

		zoom += options.zoomOffset;

		return options.maxNativeZoom ? Math.min(zoom, options.maxNativeZoom) : zoom;
	},

	_getTilePos: function (tilePoint) {
		var origin = this._map.getPixelOrigin(),
		    tileSize = this._getTileSize();

		return tilePoint.multiplyBy(tileSize).subtract(origin);
	},

	// image-specific code (override to implement e.g. Canvas or SVG tile layer)

	getTileUrl: function (tilePoint) {
		return L.Util.template(this._url, L.extend({
			s: this._getSubdomain(tilePoint),
			z: tilePoint.z,
			x: tilePoint.x,
			y: tilePoint.y
		}, this.options));
	},

	_getWrapTileNum: function () {
		var crs = this._map.options.crs,
		    size = crs.getSize(this._map.getZoom());
		return size.divideBy(this._getTileSize())._floor();
	},

	_adjustTilePoint: function (tilePoint) {

		var limit = this._getWrapTileNum();

		// wrap tile coordinates
		if (!this.options.continuousWorld && !this.options.noWrap) {
			tilePoint.x = ((tilePoint.x % limit.x) + limit.x) % limit.x;
		}

		if (this.options.tms) {
			tilePoint.y = limit.y - tilePoint.y - 1;
		}

		tilePoint.z = this._getZoomForUrl();
	},

	_getSubdomain: function (tilePoint) {
		var index = Math.abs(tilePoint.x + tilePoint.y) % this.options.subdomains.length;
		return this.options.subdomains[index];
	},

	_getTile: function () {
		if (this.options.reuseTiles && this._unusedTiles.length > 0) {
			var tile = this._unusedTiles.pop();
			this._resetTile(tile);
			return tile;
		}
		return this._createTile();
	},

	// Override if data stored on a tile needs to be cleaned up before reuse
	_resetTile: function (/*tile*/) {},

	_createTile: function () {
		var tile = L.DomUtil.create('img', 'leaflet-tile');
		tile.style.width = tile.style.height = this._getTileSize() + 'px';
		tile.galleryimg = 'no';

		tile.onselectstart = tile.onmousemove = L.Util.falseFn;

		if (L.Browser.ielt9 && this.options.opacity !== undefined) {
			L.DomUtil.setOpacity(tile, this.options.opacity);
		}
		// without this hack, tiles disappear after zoom on Chrome for Android
		// https://github.com/Leaflet/Leaflet/issues/2078
		if (L.Browser.mobileWebkit3d) {
			tile.style.WebkitBackfaceVisibility = 'hidden';
		}
		return tile;
	},

	_loadTile: function (tile, tilePoint) {
		tile._layer  = this;
		tile.onload  = this._tileOnLoad;
		tile.onerror = this._tileOnError;

		this._adjustTilePoint(tilePoint);
		tile.src     = this.getTileUrl(tilePoint);

		this.fire('tileloadstart', {
			tile: tile,
			url: tile.src
		});
	},

	_tileLoaded: function () {
		this._tilesToLoad--;

		if (this._animated) {
			L.DomUtil.addClass(this._tileContainer, 'leaflet-zoom-animated');
		}

		if (!this._tilesToLoad) {
			this.fire('load');

			if (this._animated) {
				// clear scaled tiles after all new tiles are loaded (for performance)
				clearTimeout(this._clearBgBufferTimer);
				this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			}
		}
	},

	_tileOnLoad: function () {
		var layer = this._layer;

		//Only if we are loading an actual image
		if (this.src !== L.Util.emptyImageUrl) {
			L.DomUtil.addClass(this, 'leaflet-tile-loaded');

			layer.fire('tileload', {
				tile: this,
				url: this.src
			});
		}

		layer._tileLoaded();
	},

	_tileOnError: function () {
		var layer = this._layer;

		layer.fire('tileerror', {
			tile: this,
			url: this.src
		});

		var newUrl = layer.options.errorTileUrl;
		if (newUrl) {
			this.src = newUrl;
		}

		layer._tileLoaded();
	}
});

L.tileLayer = function (url, options) {
	return new L.TileLayer(url, options);
};


/*
 * L.TileLayer.WMS is used for putting WMS tile layers on the map.
 */

L.TileLayer.WMS = L.TileLayer.extend({

	defaultWmsParams: {
		service: 'WMS',
		request: 'GetMap',
		version: '1.1.1',
		layers: '',
		styles: '',
		format: 'image/jpeg',
		transparent: false
	},

	initialize: function (url, options) { // (String, Object)

		this._url = url;

		var wmsParams = L.extend({}, this.defaultWmsParams),
		    tileSize = options.tileSize || this.options.tileSize;

		if (options.detectRetina && L.Browser.retina) {
			wmsParams.width = wmsParams.height = tileSize * 2;
		} else {
			wmsParams.width = wmsParams.height = tileSize;
		}

		for (var i in options) {
			// all keys that are not TileLayer options go to WMS params
			if (!this.options.hasOwnProperty(i) && i !== 'crs') {
				wmsParams[i] = options[i];
			}
		}

		this.wmsParams = wmsParams;

		L.setOptions(this, options);
	},

	onAdd: function (map) {

		this._crs = this.options.crs || map.options.crs;

		this._wmsVersion = parseFloat(this.wmsParams.version);

		var projectionKey = this._wmsVersion >= 1.3 ? 'crs' : 'srs';
		this.wmsParams[projectionKey] = this._crs.code;

		L.TileLayer.prototype.onAdd.call(this, map);
	},

	getTileUrl: function (tilePoint) { // (Point, Number) -> String

		var map = this._map,
		    tileSize = this.options.tileSize,

		    nwPoint = tilePoint.multiplyBy(tileSize),
		    sePoint = nwPoint.add([tileSize, tileSize]),

		    nw = this._crs.project(map.unproject(nwPoint, tilePoint.z)),
		    se = this._crs.project(map.unproject(sePoint, tilePoint.z)),
		    bbox = this._wmsVersion >= 1.3 && this._crs === L.CRS.EPSG4326 ?
		        [se.y, nw.x, nw.y, se.x].join(',') :
		        [nw.x, se.y, se.x, nw.y].join(','),

		    url = L.Util.template(this._url, {s: this._getSubdomain(tilePoint)});

		return url + L.Util.getParamString(this.wmsParams, url, true) + '&BBOX=' + bbox;
	},

	setParams: function (params, noRedraw) {

		L.extend(this.wmsParams, params);

		if (!noRedraw) {
			this.redraw();
		}

		return this;
	}
});

L.tileLayer.wms = function (url, options) {
	return new L.TileLayer.WMS(url, options);
};


/*
 * L.TileLayer.Canvas is a class that you can use as a base for creating
 * dynamically drawn Canvas-based tile layers.
 */

L.TileLayer.Canvas = L.TileLayer.extend({
	options: {
		async: false
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	redraw: function () {
		if (this._map) {
			this._reset({hard: true});
			this._update();
		}

		for (var i in this._tiles) {
			this._redrawTile(this._tiles[i]);
		}
		return this;
	},

	_redrawTile: function (tile) {
		this.drawTile(tile, tile._tilePoint, this._map._zoom);
	},

	_createTile: function () {
		var tile = L.DomUtil.create('canvas', 'leaflet-tile');
		tile.width = tile.height = this.options.tileSize;
		tile.onselectstart = tile.onmousemove = L.Util.falseFn;
		return tile;
	},

	_loadTile: function (tile, tilePoint) {
		tile._layer = this;
		tile._tilePoint = tilePoint;

		this._redrawTile(tile);

		if (!this.options.async) {
			this.tileDrawn(tile);
		}
	},

	drawTile: function (/*tile, tilePoint*/) {
		// override with rendering code
	},

	tileDrawn: function (tile) {
		this._tileOnLoad.call(tile);
	}
});


L.tileLayer.canvas = function (options) {
	return new L.TileLayer.Canvas(options);
};


/*
 * L.ImageOverlay is used to overlay images over the map (to specific geographical bounds).
 */

L.ImageOverlay = L.Class.extend({
	includes: L.Mixin.Events,

	options: {
		opacity: 1
	},

	initialize: function (url, bounds, options) { // (String, LatLngBounds, Object)
		this._url = url;
		this._bounds = L.latLngBounds(bounds);

		L.setOptions(this, options);
	},

	onAdd: function (map) {
		this._map = map;

		if (!this._image) {
			this._initImage();
		}

		map._panes.overlayPane.appendChild(this._image);

		map.on('viewreset', this._reset, this);

		if (map.options.zoomAnimation && L.Browser.any3d) {
			map.on('zoomanim', this._animateZoom, this);
		}

		this._reset();
	},

	onRemove: function (map) {
		map.getPanes().overlayPane.removeChild(this._image);

		map.off('viewreset', this._reset, this);

		if (map.options.zoomAnimation) {
			map.off('zoomanim', this._animateZoom, this);
		}
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;
		this._updateOpacity();
		return this;
	},

	// TODO remove bringToFront/bringToBack duplication from TileLayer/Path
	bringToFront: function () {
		if (this._image) {
			this._map._panes.overlayPane.appendChild(this._image);
		}
		return this;
	},

	bringToBack: function () {
		var pane = this._map._panes.overlayPane;
		if (this._image) {
			pane.insertBefore(this._image, pane.firstChild);
		}
		return this;
	},

	setUrl: function (url) {
		this._url = url;
		this._image.src = this._url;
	},

	getAttribution: function () {
		return this.options.attribution;
	},

	_initImage: function () {
		this._image = L.DomUtil.create('img', 'leaflet-image-layer');

		if (this._map.options.zoomAnimation && L.Browser.any3d) {
			L.DomUtil.addClass(this._image, 'leaflet-zoom-animated');
		} else {
			L.DomUtil.addClass(this._image, 'leaflet-zoom-hide');
		}

		this._updateOpacity();

		//TODO createImage util method to remove duplication
		L.extend(this._image, {
			galleryimg: 'no',
			onselectstart: L.Util.falseFn,
			onmousemove: L.Util.falseFn,
			onload: L.bind(this._onImageLoad, this),
			src: this._url
		});
	},

	_animateZoom: function (e) {
		var map = this._map,
		    image = this._image,
		    scale = map.getZoomScale(e.zoom),
		    nw = this._bounds.getNorthWest(),
		    se = this._bounds.getSouthEast(),

		    topLeft = map._latLngToNewLayerPoint(nw, e.zoom, e.center),
		    size = map._latLngToNewLayerPoint(se, e.zoom, e.center)._subtract(topLeft),
		    origin = topLeft._add(size._multiplyBy((1 / 2) * (1 - 1 / scale)));

		image.style[L.DomUtil.TRANSFORM] =
		        L.DomUtil.getTranslateString(origin) + ' scale(' + scale + ') ';
	},

	_reset: function () {
		var image   = this._image,
		    topLeft = this._map.latLngToLayerPoint(this._bounds.getNorthWest()),
		    size = this._map.latLngToLayerPoint(this._bounds.getSouthEast())._subtract(topLeft);

		L.DomUtil.setPosition(image, topLeft);

		image.style.width  = size.x + 'px';
		image.style.height = size.y + 'px';
	},

	_onImageLoad: function () {
		this.fire('load');
	},

	_updateOpacity: function () {
		L.DomUtil.setOpacity(this._image, this.options.opacity);
	}
});

L.imageOverlay = function (url, bounds, options) {
	return new L.ImageOverlay(url, bounds, options);
};


/*
 * L.Icon is an image-based icon class that you can use with L.Marker for custom markers.
 */

L.Icon = L.Class.extend({
	options: {
		/*
		iconUrl: (String) (required)
		iconRetinaUrl: (String) (optional, used for retina devices if detected)
		iconSize: (Point) (can be set through CSS)
		iconAnchor: (Point) (centered by default, can be set in CSS with negative margins)
		popupAnchor: (Point) (if not specified, popup opens in the anchor point)
		shadowUrl: (String) (no shadow by default)
		shadowRetinaUrl: (String) (optional, used for retina devices if detected)
		shadowSize: (Point)
		shadowAnchor: (Point)
		*/
		className: ''
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	createIcon: function (oldIcon) {
		return this._createIcon('icon', oldIcon);
	},

	createShadow: function (oldIcon) {
		return this._createIcon('shadow', oldIcon);
	},

	_createIcon: function (name, oldIcon) {
		var src = this._getIconUrl(name);

		if (!src) {
			if (name === 'icon') {
				throw new Error('iconUrl not set in Icon options (see the docs).');
			}
			return null;
		}

		var img;
		if (!oldIcon || oldIcon.tagName !== 'IMG') {
			img = this._createImg(src);
		} else {
			img = this._createImg(src, oldIcon);
		}
		this._setIconStyles(img, name);

		return img;
	},

	_setIconStyles: function (img, name) {
		var options = this.options,
		    size = L.point(options[name + 'Size']),
		    anchor;

		if (name === 'shadow') {
			anchor = L.point(options.shadowAnchor || options.iconAnchor);
		} else {
			anchor = L.point(options.iconAnchor);
		}

		if (!anchor && size) {
			anchor = size.divideBy(2, true);
		}

		img.className = 'leaflet-marker-' + name + ' ' + options.className;

		if (anchor) {
			img.style.marginLeft = (-anchor.x) + 'px';
			img.style.marginTop  = (-anchor.y) + 'px';
		}

		if (size) {
			img.style.width  = size.x + 'px';
			img.style.height = size.y + 'px';
		}
	},

	_createImg: function (src, el) {
		el = el || document.createElement('img');
		el.src = src;
		return el;
	},

	_getIconUrl: function (name) {
		if (L.Browser.retina && this.options[name + 'RetinaUrl']) {
			return this.options[name + 'RetinaUrl'];
		}
		return this.options[name + 'Url'];
	}
});

L.icon = function (options) {
	return new L.Icon(options);
};


/*
 * L.Icon.Default is the blue marker icon used by default in Leaflet.
 */

L.Icon.Default = L.Icon.extend({

	options: {
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],

		shadowSize: [41, 41]
	},

	_getIconUrl: function (name) {
		var key = name + 'Url';

		if (this.options[key]) {
			return this.options[key];
		}

		if (L.Browser.retina && name === 'icon') {
			name += '-2x';
		}

		var path = L.Icon.Default.imagePath;

		if (!path) {
			throw new Error('Couldn\'t autodetect L.Icon.Default.imagePath, set it manually.');
		}

		return path + '/marker-' + name + '.png';
	}
});

L.Icon.Default.imagePath = (function () {
	var scripts = document.getElementsByTagName('script'),
	    leafletRe = /[\/^]leaflet[\-\._]?([\w\-\._]*)\.js\??/;

	var i, len, src, matches, path;

	for (i = 0, len = scripts.length; i < len; i++) {
		src = scripts[i].src;
		matches = src.match(leafletRe);

		if (matches) {
			path = src.split(leafletRe)[0];
			return (path ? path + '/' : '') + 'images';
		}
	}
}());


/*
 * L.Marker is used to display clickable/draggable icons on the map.
 */

L.Marker = L.Class.extend({

	includes: L.Mixin.Events,

	options: {
		icon: new L.Icon.Default(),
		title: '',
		alt: '',
		clickable: true,
		draggable: false,
		keyboard: true,
		zIndexOffset: 0,
		opacity: 1,
		riseOnHover: false,
		riseOffset: 250
	},

	initialize: function (latlng, options) {
		L.setOptions(this, options);
		this._latlng = L.latLng(latlng);
	},

	onAdd: function (map) {
		this._map = map;

		map.on('viewreset', this.update, this);

		this._initIcon();
		this.update();
		this.fire('add');

		if (map.options.zoomAnimation && map.options.markerZoomAnimation) {
			map.on('zoomanim', this._animateZoom, this);
		}
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	onRemove: function (map) {
		if (this.dragging) {
			this.dragging.disable();
		}

		this._removeIcon();
		this._removeShadow();

		this.fire('remove');

		map.off({
			'viewreset': this.update,
			'zoomanim': this._animateZoom
		}, this);

		this._map = null;
	},

	getLatLng: function () {
		return this._latlng;
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);

		this.update();

		return this.fire('move', { latlng: this._latlng });
	},

	setZIndexOffset: function (offset) {
		this.options.zIndexOffset = offset;
		this.update();

		return this;
	},

	setIcon: function (icon) {

		this.options.icon = icon;

		if (this._map) {
			this._initIcon();
			this.update();
		}

		if (this._popup) {
			this.bindPopup(this._popup);
		}

		return this;
	},

	update: function () {
		if (this._icon) {
			this._setPos(this._map.latLngToLayerPoint(this._latlng).round());
		}
		return this;
	},

	_initIcon: function () {
		var options = this.options,
		    map = this._map,
		    animation = (map.options.zoomAnimation && map.options.markerZoomAnimation),
		    classToAdd = animation ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide';

		var icon = options.icon.createIcon(this._icon),
			addIcon = false;

		// if we're not reusing the icon, remove the old one and init new one
		if (icon !== this._icon) {
			if (this._icon) {
				this._removeIcon();
			}
			addIcon = true;

			if (options.title) {
				icon.title = options.title;
			}

			if (options.alt) {
				icon.alt = options.alt;
			}
		}

		L.DomUtil.addClass(icon, classToAdd);

		if (options.keyboard) {
			icon.tabIndex = '0';
		}

		this._icon = icon;

		this._initInteraction();

		if (options.riseOnHover) {
			L.DomEvent
				.on(icon, 'mouseover', this._bringToFront, this)
				.on(icon, 'mouseout', this._resetZIndex, this);
		}

		var newShadow = options.icon.createShadow(this._shadow),
			addShadow = false;

		if (newShadow !== this._shadow) {
			this._removeShadow();
			addShadow = true;
		}

		if (newShadow) {
			L.DomUtil.addClass(newShadow, classToAdd);
		}
		this._shadow = newShadow;


		if (options.opacity < 1) {
			this._updateOpacity();
		}


		var panes = this._map._panes;

		if (addIcon) {
			panes.markerPane.appendChild(this._icon);
		}

		if (newShadow && addShadow) {
			panes.shadowPane.appendChild(this._shadow);
		}
	},

	_removeIcon: function () {
		if (this.options.riseOnHover) {
			L.DomEvent
			    .off(this._icon, 'mouseover', this._bringToFront)
			    .off(this._icon, 'mouseout', this._resetZIndex);
		}

		this._map._panes.markerPane.removeChild(this._icon);

		this._icon = null;
	},

	_removeShadow: function () {
		if (this._shadow) {
			this._map._panes.shadowPane.removeChild(this._shadow);
		}
		this._shadow = null;
	},

	_setPos: function (pos) {
		L.DomUtil.setPosition(this._icon, pos);

		if (this._shadow) {
			L.DomUtil.setPosition(this._shadow, pos);
		}

		this._zIndex = pos.y + this.options.zIndexOffset;

		this._resetZIndex();
	},

	_updateZIndex: function (offset) {
		this._icon.style.zIndex = this._zIndex + offset;
	},

	_animateZoom: function (opt) {
		var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round();

		this._setPos(pos);
	},

	_initInteraction: function () {

		if (!this.options.clickable) { return; }

		// TODO refactor into something shared with Map/Path/etc. to DRY it up

		var icon = this._icon,
		    events = ['dblclick', 'mousedown', 'mouseover', 'mouseout', 'contextmenu'];

		L.DomUtil.addClass(icon, 'leaflet-clickable');
		L.DomEvent.on(icon, 'click', this._onMouseClick, this);
		L.DomEvent.on(icon, 'keypress', this._onKeyPress, this);

		for (var i = 0; i < events.length; i++) {
			L.DomEvent.on(icon, events[i], this._fireMouseEvent, this);
		}

		if (L.Handler.MarkerDrag) {
			this.dragging = new L.Handler.MarkerDrag(this);

			if (this.options.draggable) {
				this.dragging.enable();
			}
		}
	},

	_onMouseClick: function (e) {
		var wasDragged = this.dragging && this.dragging.moved();

		if (this.hasEventListeners(e.type) || wasDragged) {
			L.DomEvent.stopPropagation(e);
		}

		if (wasDragged) { return; }

		if ((!this.dragging || !this.dragging._enabled) && this._map.dragging && this._map.dragging.moved()) { return; }

		this.fire(e.type, {
			originalEvent: e,
			latlng: this._latlng
		});
	},

	_onKeyPress: function (e) {
		if (e.keyCode === 13) {
			this.fire('click', {
				originalEvent: e,
				latlng: this._latlng
			});
		}
	},

	_fireMouseEvent: function (e) {

		this.fire(e.type, {
			originalEvent: e,
			latlng: this._latlng
		});

		// TODO proper custom event propagation
		// this line will always be called if marker is in a FeatureGroup
		if (e.type === 'contextmenu' && this.hasEventListeners(e.type)) {
			L.DomEvent.preventDefault(e);
		}
		if (e.type !== 'mousedown') {
			L.DomEvent.stopPropagation(e);
		} else {
			L.DomEvent.preventDefault(e);
		}
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;
		if (this._map) {
			this._updateOpacity();
		}

		return this;
	},

	_updateOpacity: function () {
		L.DomUtil.setOpacity(this._icon, this.options.opacity);
		if (this._shadow) {
			L.DomUtil.setOpacity(this._shadow, this.options.opacity);
		}
	},

	_bringToFront: function () {
		this._updateZIndex(this.options.riseOffset);
	},

	_resetZIndex: function () {
		this._updateZIndex(0);
	}
});

L.marker = function (latlng, options) {
	return new L.Marker(latlng, options);
};


/*
 * L.DivIcon is a lightweight HTML-based icon class (as opposed to the image-based L.Icon)
 * to use with L.Marker.
 */

L.DivIcon = L.Icon.extend({
	options: {
		iconSize: [12, 12], // also can be set through CSS
		/*
		iconAnchor: (Point)
		popupAnchor: (Point)
		html: (String)
		bgPos: (Point)
		*/
		className: 'leaflet-div-icon',
		html: false
	},

	createIcon: function (oldIcon) {
		var div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon : document.createElement('div'),
		    options = this.options;

		if (options.html !== false) {
			div.innerHTML = options.html;
		} else {
			div.innerHTML = '';
		}

		if (options.bgPos) {
			div.style.backgroundPosition =
			        (-options.bgPos.x) + 'px ' + (-options.bgPos.y) + 'px';
		}

		this._setIconStyles(div, 'icon');
		return div;
	},

	createShadow: function () {
		return null;
	}
});

L.divIcon = function (options) {
	return new L.DivIcon(options);
};


/*
 * L.Popup is used for displaying popups on the map.
 */

L.Map.mergeOptions({
	closePopupOnClick: true
});

L.Popup = L.Class.extend({
	includes: L.Mixin.Events,

	options: {
		minWidth: 50,
		maxWidth: 300,
		// maxHeight: null,
		autoPan: true,
		closeButton: true,
		offset: [0, 7],
		autoPanPadding: [5, 5],
		// autoPanPaddingTopLeft: null,
		// autoPanPaddingBottomRight: null,
		keepInView: false,
		className: '',
		zoomAnimation: true
	},

	initialize: function (options, source) {
		L.setOptions(this, options);

		this._source = source;
		this._animated = L.Browser.any3d && this.options.zoomAnimation;
		this._isOpen = false;
	},

	onAdd: function (map) {
		this._map = map;

		if (!this._container) {
			this._initLayout();
		}

		var animFade = map.options.fadeAnimation;

		if (animFade) {
			L.DomUtil.setOpacity(this._container, 0);
		}
		map._panes.popupPane.appendChild(this._container);

		map.on(this._getEvents(), this);

		this.update();

		if (animFade) {
			L.DomUtil.setOpacity(this._container, 1);
		}

		this.fire('open');

		map.fire('popupopen', {popup: this});

		if (this._source) {
			this._source.fire('popupopen', {popup: this});
		}
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	openOn: function (map) {
		map.openPopup(this);
		return this;
	},

	onRemove: function (map) {
		map._panes.popupPane.removeChild(this._container);

		L.Util.falseFn(this._container.offsetWidth); // force reflow

		map.off(this._getEvents(), this);

		if (map.options.fadeAnimation) {
			L.DomUtil.setOpacity(this._container, 0);
		}

		this._map = null;

		this.fire('close');

		map.fire('popupclose', {popup: this});

		if (this._source) {
			this._source.fire('popupclose', {popup: this});
		}
	},

	getLatLng: function () {
		return this._latlng;
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);
		if (this._map) {
			this._updatePosition();
			this._adjustPan();
		}
		return this;
	},

	getContent: function () {
		return this._content;
	},

	setContent: function (content) {
		this._content = content;
		this.update();
		return this;
	},

	update: function () {
		if (!this._map) { return; }

		this._container.style.visibility = 'hidden';

		this._updateContent();
		this._updateLayout();
		this._updatePosition();

		this._container.style.visibility = '';

		this._adjustPan();
	},

	_getEvents: function () {
		var events = {
			viewreset: this._updatePosition
		};

		if (this._animated) {
			events.zoomanim = this._zoomAnimation;
		}
		if ('closeOnClick' in this.options ? this.options.closeOnClick : this._map.options.closePopupOnClick) {
			events.preclick = this._close;
		}
		if (this.options.keepInView) {
			events.moveend = this._adjustPan;
		}

		return events;
	},

	_close: function () {
		if (this._map) {
			this._map.closePopup(this);
		}
	},

	_initLayout: function () {
		var prefix = 'leaflet-popup',
			containerClass = prefix + ' ' + this.options.className + ' leaflet-zoom-' +
			        (this._animated ? 'animated' : 'hide'),
			container = this._container = L.DomUtil.create('div', containerClass),
			closeButton;

		if (this.options.closeButton) {
			closeButton = this._closeButton =
			        L.DomUtil.create('a', prefix + '-close-button', container);
			closeButton.href = '#close';
			closeButton.innerHTML = '&#215;';
			L.DomEvent.disableClickPropagation(closeButton);

			L.DomEvent.on(closeButton, 'click', this._onCloseButtonClick, this);
		}

		var wrapper = this._wrapper =
		        L.DomUtil.create('div', prefix + '-content-wrapper', container);
		L.DomEvent.disableClickPropagation(wrapper);

		this._contentNode = L.DomUtil.create('div', prefix + '-content', wrapper);

		L.DomEvent.disableScrollPropagation(this._contentNode);
		L.DomEvent.on(wrapper, 'contextmenu', L.DomEvent.stopPropagation);

		this._tipContainer = L.DomUtil.create('div', prefix + '-tip-container', container);
		this._tip = L.DomUtil.create('div', prefix + '-tip', this._tipContainer);
	},

	_updateContent: function () {
		if (!this._content) { return; }

		if (typeof this._content === 'string') {
			this._contentNode.innerHTML = this._content;
		} else {
			while (this._contentNode.hasChildNodes()) {
				this._contentNode.removeChild(this._contentNode.firstChild);
			}
			this._contentNode.appendChild(this._content);
		}
		this.fire('contentupdate');
	},

	_updateLayout: function () {
		var container = this._contentNode,
		    style = container.style;

		style.width = '';
		style.whiteSpace = 'nowrap';

		var width = container.offsetWidth;
		width = Math.min(width, this.options.maxWidth);
		width = Math.max(width, this.options.minWidth);

		style.width = (width + 1) + 'px';
		style.whiteSpace = '';

		style.height = '';

		var height = container.offsetHeight,
		    maxHeight = this.options.maxHeight,
		    scrolledClass = 'leaflet-popup-scrolled';

		if (maxHeight && height > maxHeight) {
			style.height = maxHeight + 'px';
			L.DomUtil.addClass(container, scrolledClass);
		} else {
			L.DomUtil.removeClass(container, scrolledClass);
		}

		this._containerWidth = this._container.offsetWidth;
	},

	_updatePosition: function () {
		if (!this._map) { return; }

		var pos = this._map.latLngToLayerPoint(this._latlng),
		    animated = this._animated,
		    offset = L.point(this.options.offset);

		if (animated) {
			L.DomUtil.setPosition(this._container, pos);
		}

		this._containerBottom = -offset.y - (animated ? 0 : pos.y);
		this._containerLeft = -Math.round(this._containerWidth / 2) + offset.x + (animated ? 0 : pos.x);

		// bottom position the popup in case the height of the popup changes (images loading etc)
		this._container.style.bottom = this._containerBottom + 'px';
		this._container.style.left = this._containerLeft + 'px';
	},

	_zoomAnimation: function (opt) {
		var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center);

		L.DomUtil.setPosition(this._container, pos);
	},

	_adjustPan: function () {
		if (!this.options.autoPan) { return; }

		var map = this._map,
		    containerHeight = this._container.offsetHeight,
		    containerWidth = this._containerWidth,

		    layerPos = new L.Point(this._containerLeft, -containerHeight - this._containerBottom);

		if (this._animated) {
			layerPos._add(L.DomUtil.getPosition(this._container));
		}

		var containerPos = map.layerPointToContainerPoint(layerPos),
		    padding = L.point(this.options.autoPanPadding),
		    paddingTL = L.point(this.options.autoPanPaddingTopLeft || padding),
		    paddingBR = L.point(this.options.autoPanPaddingBottomRight || padding),
		    size = map.getSize(),
		    dx = 0,
		    dy = 0;

		if (containerPos.x + containerWidth + paddingBR.x > size.x) { // right
			dx = containerPos.x + containerWidth - size.x + paddingBR.x;
		}
		if (containerPos.x - dx - paddingTL.x < 0) { // left
			dx = containerPos.x - paddingTL.x;
		}
		if (containerPos.y + containerHeight + paddingBR.y > size.y) { // bottom
			dy = containerPos.y + containerHeight - size.y + paddingBR.y;
		}
		if (containerPos.y - dy - paddingTL.y < 0) { // top
			dy = containerPos.y - paddingTL.y;
		}

		if (dx || dy) {
			map
			    .fire('autopanstart')
			    .panBy([dx, dy]);
		}
	},

	_onCloseButtonClick: function (e) {
		this._close();
		L.DomEvent.stop(e);
	}
});

L.popup = function (options, source) {
	return new L.Popup(options, source);
};


L.Map.include({
	openPopup: function (popup, latlng, options) { // (Popup) or (String || HTMLElement, LatLng[, Object])
		this.closePopup();

		if (!(popup instanceof L.Popup)) {
			var content = popup;

			popup = new L.Popup(options)
			    .setLatLng(latlng)
			    .setContent(content);
		}
		popup._isOpen = true;

		this._popup = popup;
		return this.addLayer(popup);
	},

	closePopup: function (popup) {
		if (!popup || popup === this._popup) {
			popup = this._popup;
			this._popup = null;
		}
		if (popup) {
			this.removeLayer(popup);
			popup._isOpen = false;
		}
		return this;
	}
});


/*
 * Popup extension to L.Marker, adding popup-related methods.
 */

L.Marker.include({
	openPopup: function () {
		if (this._popup && this._map && !this._map.hasLayer(this._popup)) {
			this._popup.setLatLng(this._latlng);
			this._map.openPopup(this._popup);
		}

		return this;
	},

	closePopup: function () {
		if (this._popup) {
			this._popup._close();
		}
		return this;
	},

	togglePopup: function () {
		if (this._popup) {
			if (this._popup._isOpen) {
				this.closePopup();
			} else {
				this.openPopup();
			}
		}
		return this;
	},

	bindPopup: function (content, options) {
		var anchor = L.point(this.options.icon.options.popupAnchor || [0, 0]);

		anchor = anchor.add(L.Popup.prototype.options.offset);

		if (options && options.offset) {
			anchor = anchor.add(options.offset);
		}

		options = L.extend({offset: anchor}, options);

		if (!this._popupHandlersAdded) {
			this
			    .on('click', this.togglePopup, this)
			    .on('remove', this.closePopup, this)
			    .on('move', this._movePopup, this);
			this._popupHandlersAdded = true;
		}

		if (content instanceof L.Popup) {
			L.setOptions(content, options);
			this._popup = content;
			content._source = this;
		} else {
			this._popup = new L.Popup(options, this)
				.setContent(content);
		}

		return this;
	},

	setPopupContent: function (content) {
		if (this._popup) {
			this._popup.setContent(content);
		}
		return this;
	},

	unbindPopup: function () {
		if (this._popup) {
			this._popup = null;
			this
			    .off('click', this.togglePopup, this)
			    .off('remove', this.closePopup, this)
			    .off('move', this._movePopup, this);
			this._popupHandlersAdded = false;
		}
		return this;
	},

	getPopup: function () {
		return this._popup;
	},

	_movePopup: function (e) {
		this._popup.setLatLng(e.latlng);
	}
});


/*
 * L.LayerGroup is a class to combine several layers into one so that
 * you can manipulate the group (e.g. add/remove it) as one layer.
 */

L.LayerGroup = L.Class.extend({
	initialize: function (layers) {
		this._layers = {};

		var i, len;

		if (layers) {
			for (i = 0, len = layers.length; i < len; i++) {
				this.addLayer(layers[i]);
			}
		}
	},

	addLayer: function (layer) {
		var id = this.getLayerId(layer);

		this._layers[id] = layer;

		if (this._map) {
			this._map.addLayer(layer);
		}

		return this;
	},

	removeLayer: function (layer) {
		var id = layer in this._layers ? layer : this.getLayerId(layer);

		if (this._map && this._layers[id]) {
			this._map.removeLayer(this._layers[id]);
		}

		delete this._layers[id];

		return this;
	},

	hasLayer: function (layer) {
		if (!layer) { return false; }

		return (layer in this._layers || this.getLayerId(layer) in this._layers);
	},

	clearLayers: function () {
		this.eachLayer(this.removeLayer, this);
		return this;
	},

	invoke: function (methodName) {
		var args = Array.prototype.slice.call(arguments, 1),
		    i, layer;

		for (i in this._layers) {
			layer = this._layers[i];

			if (layer[methodName]) {
				layer[methodName].apply(layer, args);
			}
		}

		return this;
	},

	onAdd: function (map) {
		this._map = map;
		this.eachLayer(map.addLayer, map);
	},

	onRemove: function (map) {
		this.eachLayer(map.removeLayer, map);
		this._map = null;
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	eachLayer: function (method, context) {
		for (var i in this._layers) {
			method.call(context, this._layers[i]);
		}
		return this;
	},

	getLayer: function (id) {
		return this._layers[id];
	},

	getLayers: function () {
		var layers = [];

		for (var i in this._layers) {
			layers.push(this._layers[i]);
		}
		return layers;
	},

	setZIndex: function (zIndex) {
		return this.invoke('setZIndex', zIndex);
	},

	getLayerId: function (layer) {
		return L.stamp(layer);
	}
});

L.layerGroup = function (layers) {
	return new L.LayerGroup(layers);
};


/*
 * L.FeatureGroup extends L.LayerGroup by introducing mouse events and additional methods
 * shared between a group of interactive layers (like vectors or markers).
 */

L.FeatureGroup = L.LayerGroup.extend({
	includes: L.Mixin.Events,

	statics: {
		EVENTS: 'click dblclick mouseover mouseout mousemove contextmenu popupopen popupclose'
	},

	addLayer: function (layer) {
		if (this.hasLayer(layer)) {
			return this;
		}

		if ('on' in layer) {
			layer.on(L.FeatureGroup.EVENTS, this._propagateEvent, this);
		}

		L.LayerGroup.prototype.addLayer.call(this, layer);

		if (this._popupContent && layer.bindPopup) {
			layer.bindPopup(this._popupContent, this._popupOptions);
		}

		return this.fire('layeradd', {layer: layer});
	},

	removeLayer: function (layer) {
		if (!this.hasLayer(layer)) {
			return this;
		}
		if (layer in this._layers) {
			layer = this._layers[layer];
		}

		layer.off(L.FeatureGroup.EVENTS, this._propagateEvent, this);

		L.LayerGroup.prototype.removeLayer.call(this, layer);

		if (this._popupContent) {
			this.invoke('unbindPopup');
		}

		return this.fire('layerremove', {layer: layer});
	},

	bindPopup: function (content, options) {
		this._popupContent = content;
		this._popupOptions = options;
		return this.invoke('bindPopup', content, options);
	},

	openPopup: function (latlng) {
		// open popup on the first layer
		for (var id in this._layers) {
			this._layers[id].openPopup(latlng);
			break;
		}
		return this;
	},

	setStyle: function (style) {
		return this.invoke('setStyle', style);
	},

	bringToFront: function () {
		return this.invoke('bringToFront');
	},

	bringToBack: function () {
		return this.invoke('bringToBack');
	},

	getBounds: function () {
		var bounds = new L.LatLngBounds();

		this.eachLayer(function (layer) {
			bounds.extend(layer instanceof L.Marker ? layer.getLatLng() : layer.getBounds());
		});

		return bounds;
	},

	_propagateEvent: function (e) {
		e = L.extend({
			layer: e.target,
			target: this
		}, e);
		this.fire(e.type, e);
	}
});

L.featureGroup = function (layers) {
	return new L.FeatureGroup(layers);
};


/*
 * L.Path is a base class for rendering vector paths on a map. Inherited by Polyline, Circle, etc.
 */

L.Path = L.Class.extend({
	includes: [L.Mixin.Events],

	statics: {
		// how much to extend the clip area around the map view
		// (relative to its size, e.g. 0.5 is half the screen in each direction)
		// set it so that SVG element doesn't exceed 1280px (vectors flicker on dragend if it is)
		CLIP_PADDING: (function () {
			var max = L.Browser.mobile ? 1280 : 2000,
			    target = (max / Math.max(window.outerWidth, window.outerHeight) - 1) / 2;
			return Math.max(0, Math.min(0.5, target));
		})()
	},

	options: {
		stroke: true,
		color: '#0033ff',
		dashArray: null,
		lineCap: null,
		lineJoin: null,
		weight: 5,
		opacity: 0.5,

		fill: false,
		fillColor: null, //same as color by default
		fillOpacity: 0.2,

		clickable: true
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	onAdd: function (map) {
		this._map = map;

		if (!this._container) {
			this._initElements();
			this._initEvents();
		}

		this.projectLatlngs();
		this._updatePath();

		if (this._container) {
			this._map._pathRoot.appendChild(this._container);
		}

		this.fire('add');

		map.on({
			'viewreset': this.projectLatlngs,
			'moveend': this._updatePath
		}, this);
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	onRemove: function (map) {
		map._pathRoot.removeChild(this._container);

		// Need to fire remove event before we set _map to null as the event hooks might need the object
		this.fire('remove');
		this._map = null;

		if (L.Browser.vml) {
			this._container = null;
			this._stroke = null;
			this._fill = null;
		}

		map.off({
			'viewreset': this.projectLatlngs,
			'moveend': this._updatePath
		}, this);
	},

	projectLatlngs: function () {
		// do all projection stuff here
	},

	setStyle: function (style) {
		L.setOptions(this, style);

		if (this._container) {
			this._updateStyle();
		}

		return this;
	},

	redraw: function () {
		if (this._map) {
			this.projectLatlngs();
			this._updatePath();
		}
		return this;
	}
});

L.Map.include({
	_updatePathViewport: function () {
		var p = L.Path.CLIP_PADDING,
		    size = this.getSize(),
		    panePos = L.DomUtil.getPosition(this._mapPane),
		    min = panePos.multiplyBy(-1)._subtract(size.multiplyBy(p)._round()),
		    max = min.add(size.multiplyBy(1 + p * 2)._round());

		this._pathViewport = new L.Bounds(min, max);
	}
});


/*
 * Extends L.Path with SVG-specific rendering code.
 */

L.Path.SVG_NS = 'http://www.w3.org/2000/svg';

L.Browser.svg = !!(document.createElementNS && document.createElementNS(L.Path.SVG_NS, 'svg').createSVGRect);

L.Path = L.Path.extend({
	statics: {
		SVG: L.Browser.svg
	},

	bringToFront: function () {
		var root = this._map._pathRoot,
		    path = this._container;

		if (path && root.lastChild !== path) {
			root.appendChild(path);
		}
		return this;
	},

	bringToBack: function () {
		var root = this._map._pathRoot,
		    path = this._container,
		    first = root.firstChild;

		if (path && first !== path) {
			root.insertBefore(path, first);
		}
		return this;
	},

	getPathString: function () {
		// form path string here
	},

	_createElement: function (name) {
		return document.createElementNS(L.Path.SVG_NS, name);
	},

	_initElements: function () {
		this._map._initPathRoot();
		this._initPath();
		this._initStyle();
	},

	_initPath: function () {
		this._container = this._createElement('g');

		this._path = this._createElement('path');

		if (this.options.className) {
			L.DomUtil.addClass(this._path, this.options.className);
		}

		this._container.appendChild(this._path);
	},

	_initStyle: function () {
		if (this.options.stroke) {
			this._path.setAttribute('stroke-linejoin', 'round');
			this._path.setAttribute('stroke-linecap', 'round');
		}
		if (this.options.fill) {
			this._path.setAttribute('fill-rule', 'evenodd');
		}
		if (this.options.pointerEvents) {
			this._path.setAttribute('pointer-events', this.options.pointerEvents);
		}
		if (!this.options.clickable && !this.options.pointerEvents) {
			this._path.setAttribute('pointer-events', 'none');
		}
		this._updateStyle();
	},

	_updateStyle: function () {
		if (this.options.stroke) {
			this._path.setAttribute('stroke', this.options.color);
			this._path.setAttribute('stroke-opacity', this.options.opacity);
			this._path.setAttribute('stroke-width', this.options.weight);
			if (this.options.dashArray) {
				this._path.setAttribute('stroke-dasharray', this.options.dashArray);
			} else {
				this._path.removeAttribute('stroke-dasharray');
			}
			if (this.options.lineCap) {
				this._path.setAttribute('stroke-linecap', this.options.lineCap);
			}
			if (this.options.lineJoin) {
				this._path.setAttribute('stroke-linejoin', this.options.lineJoin);
			}
		} else {
			this._path.setAttribute('stroke', 'none');
		}
		if (this.options.fill) {
			this._path.setAttribute('fill', this.options.fillColor || this.options.color);
			this._path.setAttribute('fill-opacity', this.options.fillOpacity);
		} else {
			this._path.setAttribute('fill', 'none');
		}
	},

	_updatePath: function () {
		var str = this.getPathString();
		if (!str) {
			// fix webkit empty string parsing bug
			str = 'M0 0';
		}
		this._path.setAttribute('d', str);
	},

	// TODO remove duplication with L.Map
	_initEvents: function () {
		if (this.options.clickable) {
			if (L.Browser.svg || !L.Browser.vml) {
				L.DomUtil.addClass(this._path, 'leaflet-clickable');
			}

			L.DomEvent.on(this._container, 'click', this._onMouseClick, this);

			var events = ['dblclick', 'mousedown', 'mouseover',
			              'mouseout', 'mousemove', 'contextmenu'];
			for (var i = 0; i < events.length; i++) {
				L.DomEvent.on(this._container, events[i], this._fireMouseEvent, this);
			}
		}
	},

	_onMouseClick: function (e) {
		if (this._map.dragging && this._map.dragging.moved()) { return; }

		this._fireMouseEvent(e);
	},

	_fireMouseEvent: function (e) {
		if (!this.hasEventListeners(e.type)) { return; }

		var map = this._map,
		    containerPoint = map.mouseEventToContainerPoint(e),
		    layerPoint = map.containerPointToLayerPoint(containerPoint),
		    latlng = map.layerPointToLatLng(layerPoint);

		this.fire(e.type, {
			latlng: latlng,
			layerPoint: layerPoint,
			containerPoint: containerPoint,
			originalEvent: e
		});

		if (e.type === 'contextmenu') {
			L.DomEvent.preventDefault(e);
		}
		if (e.type !== 'mousemove') {
			L.DomEvent.stopPropagation(e);
		}
	}
});

L.Map.include({
	_initPathRoot: function () {
		if (!this._pathRoot) {
			this._pathRoot = L.Path.prototype._createElement('svg');
			this._panes.overlayPane.appendChild(this._pathRoot);

			if (this.options.zoomAnimation && L.Browser.any3d) {
				L.DomUtil.addClass(this._pathRoot, 'leaflet-zoom-animated');

				this.on({
					'zoomanim': this._animatePathZoom,
					'zoomend': this._endPathZoom
				});
			} else {
				L.DomUtil.addClass(this._pathRoot, 'leaflet-zoom-hide');
			}

			this.on('moveend', this._updateSvgViewport);
			this._updateSvgViewport();
		}
	},

	_animatePathZoom: function (e) {
		var scale = this.getZoomScale(e.zoom),
		    offset = this._getCenterOffset(e.center)._multiplyBy(-scale)._add(this._pathViewport.min);

		this._pathRoot.style[L.DomUtil.TRANSFORM] =
		        L.DomUtil.getTranslateString(offset) + ' scale(' + scale + ') ';

		this._pathZooming = true;
	},

	_endPathZoom: function () {
		this._pathZooming = false;
	},

	_updateSvgViewport: function () {

		if (this._pathZooming) {
			// Do not update SVGs while a zoom animation is going on otherwise the animation will break.
			// When the zoom animation ends we will be updated again anyway
			// This fixes the case where you do a momentum move and zoom while the move is still ongoing.
			return;
		}

		this._updatePathViewport();

		var vp = this._pathViewport,
		    min = vp.min,
		    max = vp.max,
		    width = max.x - min.x,
		    height = max.y - min.y,
		    root = this._pathRoot,
		    pane = this._panes.overlayPane;

		// Hack to make flicker on drag end on mobile webkit less irritating
		if (L.Browser.mobileWebkit) {
			pane.removeChild(root);
		}

		L.DomUtil.setPosition(root, min);
		root.setAttribute('width', width);
		root.setAttribute('height', height);
		root.setAttribute('viewBox', [min.x, min.y, width, height].join(' '));

		if (L.Browser.mobileWebkit) {
			pane.appendChild(root);
		}
	}
});


/*
 * Popup extension to L.Path (polylines, polygons, circles), adding popup-related methods.
 */

L.Path.include({

	bindPopup: function (content, options) {

		if (content instanceof L.Popup) {
			this._popup = content;
		} else {
			if (!this._popup || options) {
				this._popup = new L.Popup(options, this);
			}
			this._popup.setContent(content);
		}

		if (!this._popupHandlersAdded) {
			this
			    .on('click', this._openPopup, this)
			    .on('remove', this.closePopup, this);

			this._popupHandlersAdded = true;
		}

		return this;
	},

	unbindPopup: function () {
		if (this._popup) {
			this._popup = null;
			this
			    .off('click', this._openPopup)
			    .off('remove', this.closePopup);

			this._popupHandlersAdded = false;
		}
		return this;
	},

	openPopup: function (latlng) {

		if (this._popup) {
			// open the popup from one of the path's points if not specified
			latlng = latlng || this._latlng ||
			         this._latlngs[Math.floor(this._latlngs.length / 2)];

			this._openPopup({latlng: latlng});
		}

		return this;
	},

	closePopup: function () {
		if (this._popup) {
			this._popup._close();
		}
		return this;
	},

	_openPopup: function (e) {
		this._popup.setLatLng(e.latlng);
		this._map.openPopup(this._popup);
	}
});


/*
 * Vector rendering for IE6-8 through VML.
 * Thanks to Dmitry Baranovsky and his Raphael library for inspiration!
 */

L.Browser.vml = !L.Browser.svg && (function () {
	try {
		var div = document.createElement('div');
		div.innerHTML = '<v:shape adj="1"/>';

		var shape = div.firstChild;
		shape.style.behavior = 'url(#default#VML)';

		return shape && (typeof shape.adj === 'object');

	} catch (e) {
		return false;
	}
}());

L.Path = L.Browser.svg || !L.Browser.vml ? L.Path : L.Path.extend({
	statics: {
		VML: true,
		CLIP_PADDING: 0.02
	},

	_createElement: (function () {
		try {
			document.namespaces.add('lvml', 'urn:schemas-microsoft-com:vml');
			return function (name) {
				return document.createElement('<lvml:' + name + ' class="lvml">');
			};
		} catch (e) {
			return function (name) {
				return document.createElement(
				        '<' + name + ' xmlns="urn:schemas-microsoft.com:vml" class="lvml">');
			};
		}
	}()),

	_initPath: function () {
		var container = this._container = this._createElement('shape');

		L.DomUtil.addClass(container, 'leaflet-vml-shape' +
			(this.options.className ? ' ' + this.options.className : ''));

		if (this.options.clickable) {
			L.DomUtil.addClass(container, 'leaflet-clickable');
		}

		container.coordsize = '1 1';

		this._path = this._createElement('path');
		container.appendChild(this._path);

		this._map._pathRoot.appendChild(container);
	},

	_initStyle: function () {
		this._updateStyle();
	},

	_updateStyle: function () {
		var stroke = this._stroke,
		    fill = this._fill,
		    options = this.options,
		    container = this._container;

		container.stroked = options.stroke;
		container.filled = options.fill;

		if (options.stroke) {
			if (!stroke) {
				stroke = this._stroke = this._createElement('stroke');
				stroke.endcap = 'round';
				container.appendChild(stroke);
			}
			stroke.weight = options.weight + 'px';
			stroke.color = options.color;
			stroke.opacity = options.opacity;

			if (options.dashArray) {
				stroke.dashStyle = L.Util.isArray(options.dashArray) ?
				    options.dashArray.join(' ') :
				    options.dashArray.replace(/( *, *)/g, ' ');
			} else {
				stroke.dashStyle = '';
			}
			if (options.lineCap) {
				stroke.endcap = options.lineCap.replace('butt', 'flat');
			}
			if (options.lineJoin) {
				stroke.joinstyle = options.lineJoin;
			}

		} else if (stroke) {
			container.removeChild(stroke);
			this._stroke = null;
		}

		if (options.fill) {
			if (!fill) {
				fill = this._fill = this._createElement('fill');
				container.appendChild(fill);
			}
			fill.color = options.fillColor || options.color;
			fill.opacity = options.fillOpacity;

		} else if (fill) {
			container.removeChild(fill);
			this._fill = null;
		}
	},

	_updatePath: function () {
		var style = this._container.style;

		style.display = 'none';
		this._path.v = this.getPathString() + ' '; // the space fixes IE empty path string bug
		style.display = '';
	}
});

L.Map.include(L.Browser.svg || !L.Browser.vml ? {} : {
	_initPathRoot: function () {
		if (this._pathRoot) { return; }

		var root = this._pathRoot = document.createElement('div');
		root.className = 'leaflet-vml-container';
		this._panes.overlayPane.appendChild(root);

		this.on('moveend', this._updatePathViewport);
		this._updatePathViewport();
	}
});


/*
 * Vector rendering for all browsers that support canvas.
 */

L.Browser.canvas = (function () {
	return !!document.createElement('canvas').getContext;
}());

L.Path = (L.Path.SVG && !window.L_PREFER_CANVAS) || !L.Browser.canvas ? L.Path : L.Path.extend({
	statics: {
		//CLIP_PADDING: 0.02, // not sure if there's a need to set it to a small value
		CANVAS: true,
		SVG: false
	},

	redraw: function () {
		if (this._map) {
			this.projectLatlngs();
			this._requestUpdate();
		}
		return this;
	},

	setStyle: function (style) {
		L.setOptions(this, style);

		if (this._map) {
			this._updateStyle();
			this._requestUpdate();
		}
		return this;
	},

	onRemove: function (map) {
		map
		    .off('viewreset', this.projectLatlngs, this)
		    .off('moveend', this._updatePath, this);

		if (this.options.clickable) {
			this._map.off('click', this._onClick, this);
			this._map.off('mousemove', this._onMouseMove, this);
		}

		this._requestUpdate();
		
		this.fire('remove');
		this._map = null;
	},

	_requestUpdate: function () {
		if (this._map && !L.Path._updateRequest) {
			L.Path._updateRequest = L.Util.requestAnimFrame(this._fireMapMoveEnd, this._map);
		}
	},

	_fireMapMoveEnd: function () {
		L.Path._updateRequest = null;
		this.fire('moveend');
	},

	_initElements: function () {
		this._map._initPathRoot();
		this._ctx = this._map._canvasCtx;
	},

	_updateStyle: function () {
		var options = this.options;

		if (options.stroke) {
			this._ctx.lineWidth = options.weight;
			this._ctx.strokeStyle = options.color;
		}
		if (options.fill) {
			this._ctx.fillStyle = options.fillColor || options.color;
		}

		if (options.lineCap) {
			this._ctx.lineCap = options.lineCap;
		}
		if (options.lineJoin) {
			this._ctx.lineJoin = options.lineJoin;
		}
	},

	_drawPath: function () {
		var i, j, len, len2, point, drawMethod;

		this._ctx.beginPath();

		for (i = 0, len = this._parts.length; i < len; i++) {
			for (j = 0, len2 = this._parts[i].length; j < len2; j++) {
				point = this._parts[i][j];
				drawMethod = (j === 0 ? 'move' : 'line') + 'To';

				this._ctx[drawMethod](point.x, point.y);
			}
			// TODO refactor ugly hack
			if (this instanceof L.Polygon) {
				this._ctx.closePath();
			}
		}
	},

	_checkIfEmpty: function () {
		return !this._parts.length;
	},

	_updatePath: function () {
		if (this._checkIfEmpty()) { return; }

		var ctx = this._ctx,
		    options = this.options;

		this._drawPath();
		ctx.save();
		this._updateStyle();

		if (options.fill) {
			ctx.globalAlpha = options.fillOpacity;
			ctx.fill(options.fillRule || 'evenodd');
		}

		if (options.stroke) {
			ctx.globalAlpha = options.opacity;
			ctx.stroke();
		}

		ctx.restore();

		// TODO optimization: 1 fill/stroke for all features with equal style instead of 1 for each feature
	},

	_initEvents: function () {
		if (this.options.clickable) {
			this._map.on('mousemove', this._onMouseMove, this);
			this._map.on('click dblclick contextmenu', this._fireMouseEvent, this);
		}
	},

	_fireMouseEvent: function (e) {
		if (this._containsPoint(e.layerPoint)) {
			this.fire(e.type, e);
		}
	},

	_onMouseMove: function (e) {
		if (!this._map || this._map._animatingZoom) { return; }

		// TODO don't do on each move
		if (this._containsPoint(e.layerPoint)) {
			this._ctx.canvas.style.cursor = 'pointer';
			this._mouseInside = true;
			this.fire('mouseover', e);

		} else if (this._mouseInside) {
			this._ctx.canvas.style.cursor = '';
			this._mouseInside = false;
			this.fire('mouseout', e);
		}
	}
});

L.Map.include((L.Path.SVG && !window.L_PREFER_CANVAS) || !L.Browser.canvas ? {} : {
	_initPathRoot: function () {
		var root = this._pathRoot,
		    ctx;

		if (!root) {
			root = this._pathRoot = document.createElement('canvas');
			root.style.position = 'absolute';
			ctx = this._canvasCtx = root.getContext('2d');

			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			this._panes.overlayPane.appendChild(root);

			if (this.options.zoomAnimation) {
				this._pathRoot.className = 'leaflet-zoom-animated';
				this.on('zoomanim', this._animatePathZoom);
				this.on('zoomend', this._endPathZoom);
			}
			this.on('moveend', this._updateCanvasViewport);
			this._updateCanvasViewport();
		}
	},

	_updateCanvasViewport: function () {
		// don't redraw while zooming. See _updateSvgViewport for more details
		if (this._pathZooming) { return; }
		this._updatePathViewport();

		var vp = this._pathViewport,
		    min = vp.min,
		    size = vp.max.subtract(min),
		    root = this._pathRoot;

		//TODO check if this works properly on mobile webkit
		L.DomUtil.setPosition(root, min);
		root.width = size.x;
		root.height = size.y;
		root.getContext('2d').translate(-min.x, -min.y);
	}
});


/*
 * L.LineUtil contains different utility functions for line segments
 * and polylines (clipping, simplification, distances, etc.)
 */

/*jshint bitwise:false */ // allow bitwise operations for this file

L.LineUtil = {

	// Simplify polyline with vertex reduction and Douglas-Peucker simplification.
	// Improves rendering performance dramatically by lessening the number of points to draw.

	simplify: function (/*Point[]*/ points, /*Number*/ tolerance) {
		if (!tolerance || !points.length) {
			return points.slice();
		}

		var sqTolerance = tolerance * tolerance;

		// stage 1: vertex reduction
		points = this._reducePoints(points, sqTolerance);

		// stage 2: Douglas-Peucker simplification
		points = this._simplifyDP(points, sqTolerance);

		return points;
	},

	// distance from a point to a segment between two points
	pointToSegmentDistance:  function (/*Point*/ p, /*Point*/ p1, /*Point*/ p2) {
		return Math.sqrt(this._sqClosestPointOnSegment(p, p1, p2, true));
	},

	closestPointOnSegment: function (/*Point*/ p, /*Point*/ p1, /*Point*/ p2) {
		return this._sqClosestPointOnSegment(p, p1, p2);
	},

	// Douglas-Peucker simplification, see http://en.wikipedia.org/wiki/Douglas-Peucker_algorithm
	_simplifyDP: function (points, sqTolerance) {

		var len = points.length,
		    ArrayConstructor = typeof Uint8Array !== undefined + '' ? Uint8Array : Array,
		    markers = new ArrayConstructor(len);

		markers[0] = markers[len - 1] = 1;

		this._simplifyDPStep(points, markers, sqTolerance, 0, len - 1);

		var i,
		    newPoints = [];

		for (i = 0; i < len; i++) {
			if (markers[i]) {
				newPoints.push(points[i]);
			}
		}

		return newPoints;
	},

	_simplifyDPStep: function (points, markers, sqTolerance, first, last) {

		var maxSqDist = 0,
		    index, i, sqDist;

		for (i = first + 1; i <= last - 1; i++) {
			sqDist = this._sqClosestPointOnSegment(points[i], points[first], points[last], true);

			if (sqDist > maxSqDist) {
				index = i;
				maxSqDist = sqDist;
			}
		}

		if (maxSqDist > sqTolerance) {
			markers[index] = 1;

			this._simplifyDPStep(points, markers, sqTolerance, first, index);
			this._simplifyDPStep(points, markers, sqTolerance, index, last);
		}
	},

	// reduce points that are too close to each other to a single point
	_reducePoints: function (points, sqTolerance) {
		var reducedPoints = [points[0]];

		for (var i = 1, prev = 0, len = points.length; i < len; i++) {
			if (this._sqDist(points[i], points[prev]) > sqTolerance) {
				reducedPoints.push(points[i]);
				prev = i;
			}
		}
		if (prev < len - 1) {
			reducedPoints.push(points[len - 1]);
		}
		return reducedPoints;
	},

	// Cohen-Sutherland line clipping algorithm.
	// Used to avoid rendering parts of a polyline that are not currently visible.

	clipSegment: function (a, b, bounds, useLastCode) {
		var codeA = useLastCode ? this._lastCode : this._getBitCode(a, bounds),
		    codeB = this._getBitCode(b, bounds),

		    codeOut, p, newCode;

		// save 2nd code to avoid calculating it on the next segment
		this._lastCode = codeB;

		while (true) {
			// if a,b is inside the clip window (trivial accept)
			if (!(codeA | codeB)) {
				return [a, b];
			// if a,b is outside the clip window (trivial reject)
			} else if (codeA & codeB) {
				return false;
			// other cases
			} else {
				codeOut = codeA || codeB;
				p = this._getEdgeIntersection(a, b, codeOut, bounds);
				newCode = this._getBitCode(p, bounds);

				if (codeOut === codeA) {
					a = p;
					codeA = newCode;
				} else {
					b = p;
					codeB = newCode;
				}
			}
		}
	},

	_getEdgeIntersection: function (a, b, code, bounds) {
		var dx = b.x - a.x,
		    dy = b.y - a.y,
		    min = bounds.min,
		    max = bounds.max;

		if (code & 8) { // top
			return new L.Point(a.x + dx * (max.y - a.y) / dy, max.y);
		} else if (code & 4) { // bottom
			return new L.Point(a.x + dx * (min.y - a.y) / dy, min.y);
		} else if (code & 2) { // right
			return new L.Point(max.x, a.y + dy * (max.x - a.x) / dx);
		} else if (code & 1) { // left
			return new L.Point(min.x, a.y + dy * (min.x - a.x) / dx);
		}
	},

	_getBitCode: function (/*Point*/ p, bounds) {
		var code = 0;

		if (p.x < bounds.min.x) { // left
			code |= 1;
		} else if (p.x > bounds.max.x) { // right
			code |= 2;
		}
		if (p.y < bounds.min.y) { // bottom
			code |= 4;
		} else if (p.y > bounds.max.y) { // top
			code |= 8;
		}

		return code;
	},

	// square distance (to avoid unnecessary Math.sqrt calls)
	_sqDist: function (p1, p2) {
		var dx = p2.x - p1.x,
		    dy = p2.y - p1.y;
		return dx * dx + dy * dy;
	},

	// return closest point on segment or distance to that point
	_sqClosestPointOnSegment: function (p, p1, p2, sqDist) {
		var x = p1.x,
		    y = p1.y,
		    dx = p2.x - x,
		    dy = p2.y - y,
		    dot = dx * dx + dy * dy,
		    t;

		if (dot > 0) {
			t = ((p.x - x) * dx + (p.y - y) * dy) / dot;

			if (t > 1) {
				x = p2.x;
				y = p2.y;
			} else if (t > 0) {
				x += dx * t;
				y += dy * t;
			}
		}

		dx = p.x - x;
		dy = p.y - y;

		return sqDist ? dx * dx + dy * dy : new L.Point(x, y);
	}
};


/*
 * L.Polyline is used to display polylines on a map.
 */

L.Polyline = L.Path.extend({
	initialize: function (latlngs, options) {
		L.Path.prototype.initialize.call(this, options);

		this._latlngs = this._convertLatLngs(latlngs);
	},

	options: {
		// how much to simplify the polyline on each zoom level
		// more = better performance and smoother look, less = more accurate
		smoothFactor: 1.0,
		noClip: false
	},

	projectLatlngs: function () {
		this._originalPoints = [];

		for (var i = 0, len = this._latlngs.length; i < len; i++) {
			this._originalPoints[i] = this._map.latLngToLayerPoint(this._latlngs[i]);
		}
	},

	getPathString: function () {
		for (var i = 0, len = this._parts.length, str = ''; i < len; i++) {
			str += this._getPathPartStr(this._parts[i]);
		}
		return str;
	},

	getLatLngs: function () {
		return this._latlngs;
	},

	setLatLngs: function (latlngs) {
		this._latlngs = this._convertLatLngs(latlngs);
		return this.redraw();
	},

	addLatLng: function (latlng) {
		this._latlngs.push(L.latLng(latlng));
		return this.redraw();
	},

	spliceLatLngs: function () { // (Number index, Number howMany)
		var removed = [].splice.apply(this._latlngs, arguments);
		this._convertLatLngs(this._latlngs, true);
		this.redraw();
		return removed;
	},

	closestLayerPoint: function (p) {
		var minDistance = Infinity, parts = this._parts, p1, p2, minPoint = null;

		for (var j = 0, jLen = parts.length; j < jLen; j++) {
			var points = parts[j];
			for (var i = 1, len = points.length; i < len; i++) {
				p1 = points[i - 1];
				p2 = points[i];
				var sqDist = L.LineUtil._sqClosestPointOnSegment(p, p1, p2, true);
				if (sqDist < minDistance) {
					minDistance = sqDist;
					minPoint = L.LineUtil._sqClosestPointOnSegment(p, p1, p2);
				}
			}
		}
		if (minPoint) {
			minPoint.distance = Math.sqrt(minDistance);
		}
		return minPoint;
	},

	getBounds: function () {
		return new L.LatLngBounds(this.getLatLngs());
	},

	_convertLatLngs: function (latlngs, overwrite) {
		var i, len, target = overwrite ? latlngs : [];

		for (i = 0, len = latlngs.length; i < len; i++) {
			if (L.Util.isArray(latlngs[i]) && typeof latlngs[i][0] !== 'number') {
				return;
			}
			target[i] = L.latLng(latlngs[i]);
		}
		return target;
	},

	_initEvents: function () {
		L.Path.prototype._initEvents.call(this);
	},

	_getPathPartStr: function (points) {
		var round = L.Path.VML;

		for (var j = 0, len2 = points.length, str = '', p; j < len2; j++) {
			p = points[j];
			if (round) {
				p._round();
			}
			str += (j ? 'L' : 'M') + p.x + ' ' + p.y;
		}
		return str;
	},

	_clipPoints: function () {
		var points = this._originalPoints,
		    len = points.length,
		    i, k, segment;

		if (this.options.noClip) {
			this._parts = [points];
			return;
		}

		this._parts = [];

		var parts = this._parts,
		    vp = this._map._pathViewport,
		    lu = L.LineUtil;

		for (i = 0, k = 0; i < len - 1; i++) {
			segment = lu.clipSegment(points[i], points[i + 1], vp, i);
			if (!segment) {
				continue;
			}

			parts[k] = parts[k] || [];
			parts[k].push(segment[0]);

			// if segment goes out of screen, or it's the last one, it's the end of the line part
			if ((segment[1] !== points[i + 1]) || (i === len - 2)) {
				parts[k].push(segment[1]);
				k++;
			}
		}
	},

	// simplify each clipped part of the polyline
	_simplifyPoints: function () {
		var parts = this._parts,
		    lu = L.LineUtil;

		for (var i = 0, len = parts.length; i < len; i++) {
			parts[i] = lu.simplify(parts[i], this.options.smoothFactor);
		}
	},

	_updatePath: function () {
		if (!this._map) { return; }

		this._clipPoints();
		this._simplifyPoints();

		L.Path.prototype._updatePath.call(this);
	}
});

L.polyline = function (latlngs, options) {
	return new L.Polyline(latlngs, options);
};


/*
 * L.PolyUtil contains utility functions for polygons (clipping, etc.).
 */

/*jshint bitwise:false */ // allow bitwise operations here

L.PolyUtil = {};

/*
 * Sutherland-Hodgeman polygon clipping algorithm.
 * Used to avoid rendering parts of a polygon that are not currently visible.
 */
L.PolyUtil.clipPolygon = function (points, bounds) {
	var clippedPoints,
	    edges = [1, 4, 2, 8],
	    i, j, k,
	    a, b,
	    len, edge, p,
	    lu = L.LineUtil;

	for (i = 0, len = points.length; i < len; i++) {
		points[i]._code = lu._getBitCode(points[i], bounds);
	}

	// for each edge (left, bottom, right, top)
	for (k = 0; k < 4; k++) {
		edge = edges[k];
		clippedPoints = [];

		for (i = 0, len = points.length, j = len - 1; i < len; j = i++) {
			a = points[i];
			b = points[j];

			// if a is inside the clip window
			if (!(a._code & edge)) {
				// if b is outside the clip window (a->b goes out of screen)
				if (b._code & edge) {
					p = lu._getEdgeIntersection(b, a, edge, bounds);
					p._code = lu._getBitCode(p, bounds);
					clippedPoints.push(p);
				}
				clippedPoints.push(a);

			// else if b is inside the clip window (a->b enters the screen)
			} else if (!(b._code & edge)) {
				p = lu._getEdgeIntersection(b, a, edge, bounds);
				p._code = lu._getBitCode(p, bounds);
				clippedPoints.push(p);
			}
		}
		points = clippedPoints;
	}

	return points;
};


/*
 * L.Polygon is used to display polygons on a map.
 */

L.Polygon = L.Polyline.extend({
	options: {
		fill: true
	},

	initialize: function (latlngs, options) {
		L.Polyline.prototype.initialize.call(this, latlngs, options);
		this._initWithHoles(latlngs);
	},

	_initWithHoles: function (latlngs) {
		var i, len, hole;
		if (latlngs && L.Util.isArray(latlngs[0]) && (typeof latlngs[0][0] !== 'number')) {
			this._latlngs = this._convertLatLngs(latlngs[0]);
			this._holes = latlngs.slice(1);

			for (i = 0, len = this._holes.length; i < len; i++) {
				hole = this._holes[i] = this._convertLatLngs(this._holes[i]);
				if (hole[0].equals(hole[hole.length - 1])) {
					hole.pop();
				}
			}
		}

		// filter out last point if its equal to the first one
		latlngs = this._latlngs;

		if (latlngs.length >= 2 && latlngs[0].equals(latlngs[latlngs.length - 1])) {
			latlngs.pop();
		}
	},

	projectLatlngs: function () {
		L.Polyline.prototype.projectLatlngs.call(this);

		// project polygon holes points
		// TODO move this logic to Polyline to get rid of duplication
		this._holePoints = [];

		if (!this._holes) { return; }

		var i, j, len, len2;

		for (i = 0, len = this._holes.length; i < len; i++) {
			this._holePoints[i] = [];

			for (j = 0, len2 = this._holes[i].length; j < len2; j++) {
				this._holePoints[i][j] = this._map.latLngToLayerPoint(this._holes[i][j]);
			}
		}
	},

	setLatLngs: function (latlngs) {
		if (latlngs && L.Util.isArray(latlngs[0]) && (typeof latlngs[0][0] !== 'number')) {
			this._initWithHoles(latlngs);
			return this.redraw();
		} else {
			return L.Polyline.prototype.setLatLngs.call(this, latlngs);
		}
	},

	_clipPoints: function () {
		var points = this._originalPoints,
		    newParts = [];

		this._parts = [points].concat(this._holePoints);

		if (this.options.noClip) { return; }

		for (var i = 0, len = this._parts.length; i < len; i++) {
			var clipped = L.PolyUtil.clipPolygon(this._parts[i], this._map._pathViewport);
			if (clipped.length) {
				newParts.push(clipped);
			}
		}

		this._parts = newParts;
	},

	_getPathPartStr: function (points) {
		var str = L.Polyline.prototype._getPathPartStr.call(this, points);
		return str + (L.Browser.svg ? 'z' : 'x');
	}
});

L.polygon = function (latlngs, options) {
	return new L.Polygon(latlngs, options);
};


/*
 * Contains L.MultiPolyline and L.MultiPolygon layers.
 */

(function () {
	function createMulti(Klass) {

		return L.FeatureGroup.extend({

			initialize: function (latlngs, options) {
				this._layers = {};
				this._options = options;
				this.setLatLngs(latlngs);
			},

			setLatLngs: function (latlngs) {
				var i = 0,
				    len = latlngs.length;

				this.eachLayer(function (layer) {
					if (i < len) {
						layer.setLatLngs(latlngs[i++]);
					} else {
						this.removeLayer(layer);
					}
				}, this);

				while (i < len) {
					this.addLayer(new Klass(latlngs[i++], this._options));
				}

				return this;
			},

			getLatLngs: function () {
				var latlngs = [];

				this.eachLayer(function (layer) {
					latlngs.push(layer.getLatLngs());
				});

				return latlngs;
			}
		});
	}

	L.MultiPolyline = createMulti(L.Polyline);
	L.MultiPolygon = createMulti(L.Polygon);

	L.multiPolyline = function (latlngs, options) {
		return new L.MultiPolyline(latlngs, options);
	};

	L.multiPolygon = function (latlngs, options) {
		return new L.MultiPolygon(latlngs, options);
	};
}());


/*
 * L.Rectangle extends Polygon and creates a rectangle when passed a LatLngBounds object.
 */

L.Rectangle = L.Polygon.extend({
	initialize: function (latLngBounds, options) {
		L.Polygon.prototype.initialize.call(this, this._boundsToLatLngs(latLngBounds), options);
	},

	setBounds: function (latLngBounds) {
		this.setLatLngs(this._boundsToLatLngs(latLngBounds));
	},

	_boundsToLatLngs: function (latLngBounds) {
		latLngBounds = L.latLngBounds(latLngBounds);
		return [
			latLngBounds.getSouthWest(),
			latLngBounds.getNorthWest(),
			latLngBounds.getNorthEast(),
			latLngBounds.getSouthEast()
		];
	}
});

L.rectangle = function (latLngBounds, options) {
	return new L.Rectangle(latLngBounds, options);
};


/*
 * L.Circle is a circle overlay (with a certain radius in meters).
 */

L.Circle = L.Path.extend({
	initialize: function (latlng, radius, options) {
		L.Path.prototype.initialize.call(this, options);

		this._latlng = L.latLng(latlng);
		this._mRadius = radius;
	},

	options: {
		fill: true
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);
		return this.redraw();
	},

	setRadius: function (radius) {
		this._mRadius = radius;
		return this.redraw();
	},

	projectLatlngs: function () {
		var lngRadius = this._getLngRadius(),
		    latlng = this._latlng,
		    pointLeft = this._map.latLngToLayerPoint([latlng.lat, latlng.lng - lngRadius]);

		this._point = this._map.latLngToLayerPoint(latlng);
		this._radius = Math.max(this._point.x - pointLeft.x, 1);
	},

	getBounds: function () {
		var lngRadius = this._getLngRadius(),
		    latRadius = (this._mRadius / 40075017) * 360,
		    latlng = this._latlng;

		return new L.LatLngBounds(
		        [latlng.lat - latRadius, latlng.lng - lngRadius],
		        [latlng.lat + latRadius, latlng.lng + lngRadius]);
	},

	getLatLng: function () {
		return this._latlng;
	},

	getPathString: function () {
		var p = this._point,
		    r = this._radius;

		if (this._checkIfEmpty()) {
			return '';
		}

		if (L.Browser.svg) {
			return 'M' + p.x + ',' + (p.y - r) +
			       'A' + r + ',' + r + ',0,1,1,' +
			       (p.x - 0.1) + ',' + (p.y - r) + ' z';
		} else {
			p._round();
			r = Math.round(r);
			return 'AL ' + p.x + ',' + p.y + ' ' + r + ',' + r + ' 0,' + (65535 * 360);
		}
	},

	getRadius: function () {
		return this._mRadius;
	},

	// TODO Earth hardcoded, move into projection code!

	_getLatRadius: function () {
		return (this._mRadius / 40075017) * 360;
	},

	_getLngRadius: function () {
		return this._getLatRadius() / Math.cos(L.LatLng.DEG_TO_RAD * this._latlng.lat);
	},

	_checkIfEmpty: function () {
		if (!this._map) {
			return false;
		}
		var vp = this._map._pathViewport,
		    r = this._radius,
		    p = this._point;

		return p.x - r > vp.max.x || p.y - r > vp.max.y ||
		       p.x + r < vp.min.x || p.y + r < vp.min.y;
	}
});

L.circle = function (latlng, radius, options) {
	return new L.Circle(latlng, radius, options);
};


/*
 * L.CircleMarker is a circle overlay with a permanent pixel radius.
 */

L.CircleMarker = L.Circle.extend({
	options: {
		radius: 10,
		weight: 2
	},

	initialize: function (latlng, options) {
		L.Circle.prototype.initialize.call(this, latlng, null, options);
		this._radius = this.options.radius;
	},

	projectLatlngs: function () {
		this._point = this._map.latLngToLayerPoint(this._latlng);
	},

	_updateStyle : function () {
		L.Circle.prototype._updateStyle.call(this);
		this.setRadius(this.options.radius);
	},

	setLatLng: function (latlng) {
		L.Circle.prototype.setLatLng.call(this, latlng);
		if (this._popup && this._popup._isOpen) {
			this._popup.setLatLng(latlng);
		}
		return this;
	},

	setRadius: function (radius) {
		this.options.radius = this._radius = radius;
		return this.redraw();
	},

	getRadius: function () {
		return this._radius;
	}
});

L.circleMarker = function (latlng, options) {
	return new L.CircleMarker(latlng, options);
};


/*
 * Extends L.Polyline to be able to manually detect clicks on Canvas-rendered polylines.
 */

L.Polyline.include(!L.Path.CANVAS ? {} : {
	_containsPoint: function (p, closed) {
		var i, j, k, len, len2, dist, part,
		    w = this.options.weight / 2;

		if (L.Browser.touch) {
			w += 10; // polyline click tolerance on touch devices
		}

		for (i = 0, len = this._parts.length; i < len; i++) {
			part = this._parts[i];
			for (j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
				if (!closed && (j === 0)) {
					continue;
				}

				dist = L.LineUtil.pointToSegmentDistance(p, part[k], part[j]);

				if (dist <= w) {
					return true;
				}
			}
		}
		return false;
	}
});


/*
 * Extends L.Polygon to be able to manually detect clicks on Canvas-rendered polygons.
 */

L.Polygon.include(!L.Path.CANVAS ? {} : {
	_containsPoint: function (p) {
		var inside = false,
		    part, p1, p2,
		    i, j, k,
		    len, len2;

		// TODO optimization: check if within bounds first

		if (L.Polyline.prototype._containsPoint.call(this, p, true)) {
			// click on polygon border
			return true;
		}

		// ray casting algorithm for detecting if point is in polygon

		for (i = 0, len = this._parts.length; i < len; i++) {
			part = this._parts[i];

			for (j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
				p1 = part[j];
				p2 = part[k];

				if (((p1.y > p.y) !== (p2.y > p.y)) &&
						(p.x < (p2.x - p1.x) * (p.y - p1.y) / (p2.y - p1.y) + p1.x)) {
					inside = !inside;
				}
			}
		}

		return inside;
	}
});


/*
 * Extends L.Circle with Canvas-specific code.
 */

L.Circle.include(!L.Path.CANVAS ? {} : {
	_drawPath: function () {
		var p = this._point;
		this._ctx.beginPath();
		this._ctx.arc(p.x, p.y, this._radius, 0, Math.PI * 2, false);
	},

	_containsPoint: function (p) {
		var center = this._point,
		    w2 = this.options.stroke ? this.options.weight / 2 : 0;

		return (p.distanceTo(center) <= this._radius + w2);
	}
});


/*
 * CircleMarker canvas specific drawing parts.
 */

L.CircleMarker.include(!L.Path.CANVAS ? {} : {
	_updateStyle: function () {
		L.Path.prototype._updateStyle.call(this);
	}
});


/*
 * L.GeoJSON turns any GeoJSON data into a Leaflet layer.
 */

L.GeoJSON = L.FeatureGroup.extend({

	initialize: function (geojson, options) {
		L.setOptions(this, options);

		this._layers = {};

		if (geojson) {
			this.addData(geojson);
		}
	},

	addData: function (geojson) {
		var features = L.Util.isArray(geojson) ? geojson : geojson.features,
		    i, len, feature;

		if (features) {
			for (i = 0, len = features.length; i < len; i++) {
				// Only add this if geometry or geometries are set and not null
				feature = features[i];
				if (feature.geometries || feature.geometry || feature.features || feature.coordinates) {
					this.addData(features[i]);
				}
			}
			return this;
		}

		var options = this.options;

		if (options.filter && !options.filter(geojson)) { return; }

		var layer = L.GeoJSON.geometryToLayer(geojson, options.pointToLayer, options.coordsToLatLng, options);
		layer.feature = L.GeoJSON.asFeature(geojson);

		layer.defaultOptions = layer.options;
		this.resetStyle(layer);

		if (options.onEachFeature) {
			options.onEachFeature(geojson, layer);
		}

		return this.addLayer(layer);
	},

	resetStyle: function (layer) {
		var style = this.options.style;
		if (style) {
			// reset any custom styles
			L.Util.extend(layer.options, layer.defaultOptions);

			this._setLayerStyle(layer, style);
		}
	},

	setStyle: function (style) {
		this.eachLayer(function (layer) {
			this._setLayerStyle(layer, style);
		}, this);
	},

	_setLayerStyle: function (layer, style) {
		if (typeof style === 'function') {
			style = style(layer.feature);
		}
		if (layer.setStyle) {
			layer.setStyle(style);
		}
	}
});

L.extend(L.GeoJSON, {
	geometryToLayer: function (geojson, pointToLayer, coordsToLatLng, vectorOptions) {
		var geometry = geojson.type === 'Feature' ? geojson.geometry : geojson,
		    coords = geometry.coordinates,
		    layers = [],
		    latlng, latlngs, i, len;

		coordsToLatLng = coordsToLatLng || this.coordsToLatLng;

		switch (geometry.type) {
		case 'Point':
			latlng = coordsToLatLng(coords);
			return pointToLayer ? pointToLayer(geojson, latlng) : new L.Marker(latlng);

		case 'MultiPoint':
			for (i = 0, len = coords.length; i < len; i++) {
				latlng = coordsToLatLng(coords[i]);
				layers.push(pointToLayer ? pointToLayer(geojson, latlng) : new L.Marker(latlng));
			}
			return new L.FeatureGroup(layers);

		case 'LineString':
			latlngs = this.coordsToLatLngs(coords, 0, coordsToLatLng);
			return new L.Polyline(latlngs, vectorOptions);

		case 'Polygon':
			if (coords.length === 2 && !coords[1].length) {
				throw new Error('Invalid GeoJSON object.');
			}
			latlngs = this.coordsToLatLngs(coords, 1, coordsToLatLng);
			return new L.Polygon(latlngs, vectorOptions);

		case 'MultiLineString':
			latlngs = this.coordsToLatLngs(coords, 1, coordsToLatLng);
			return new L.MultiPolyline(latlngs, vectorOptions);

		case 'MultiPolygon':
			latlngs = this.coordsToLatLngs(coords, 2, coordsToLatLng);
			return new L.MultiPolygon(latlngs, vectorOptions);

		case 'GeometryCollection':
			for (i = 0, len = geometry.geometries.length; i < len; i++) {

				layers.push(this.geometryToLayer({
					geometry: geometry.geometries[i],
					type: 'Feature',
					properties: geojson.properties
				}, pointToLayer, coordsToLatLng, vectorOptions));
			}
			return new L.FeatureGroup(layers);

		default:
			throw new Error('Invalid GeoJSON object.');
		}
	},

	coordsToLatLng: function (coords) { // (Array[, Boolean]) -> LatLng
		return new L.LatLng(coords[1], coords[0], coords[2]);
	},

	coordsToLatLngs: function (coords, levelsDeep, coordsToLatLng) { // (Array[, Number, Function]) -> Array
		var latlng, i, len,
		    latlngs = [];

		for (i = 0, len = coords.length; i < len; i++) {
			latlng = levelsDeep ?
			        this.coordsToLatLngs(coords[i], levelsDeep - 1, coordsToLatLng) :
			        (coordsToLatLng || this.coordsToLatLng)(coords[i]);

			latlngs.push(latlng);
		}

		return latlngs;
	},

	latLngToCoords: function (latlng) {
		var coords = [latlng.lng, latlng.lat];

		if (latlng.alt !== undefined) {
			coords.push(latlng.alt);
		}
		return coords;
	},

	latLngsToCoords: function (latLngs) {
		var coords = [];

		for (var i = 0, len = latLngs.length; i < len; i++) {
			coords.push(L.GeoJSON.latLngToCoords(latLngs[i]));
		}

		return coords;
	},

	getFeature: function (layer, newGeometry) {
		return layer.feature ? L.extend({}, layer.feature, {geometry: newGeometry}) : L.GeoJSON.asFeature(newGeometry);
	},

	asFeature: function (geoJSON) {
		if (geoJSON.type === 'Feature') {
			return geoJSON;
		}

		return {
			type: 'Feature',
			properties: {},
			geometry: geoJSON
		};
	}
});

var PointToGeoJSON = {
	toGeoJSON: function () {
		return L.GeoJSON.getFeature(this, {
			type: 'Point',
			coordinates: L.GeoJSON.latLngToCoords(this.getLatLng())
		});
	}
};

L.Marker.include(PointToGeoJSON);
L.Circle.include(PointToGeoJSON);
L.CircleMarker.include(PointToGeoJSON);

L.Polyline.include({
	toGeoJSON: function () {
		return L.GeoJSON.getFeature(this, {
			type: 'LineString',
			coordinates: L.GeoJSON.latLngsToCoords(this.getLatLngs())
		});
	}
});

L.Polygon.include({
	toGeoJSON: function () {
		var coords = [L.GeoJSON.latLngsToCoords(this.getLatLngs())],
		    i, len, hole;

		coords[0].push(coords[0][0]);

		if (this._holes) {
			for (i = 0, len = this._holes.length; i < len; i++) {
				hole = L.GeoJSON.latLngsToCoords(this._holes[i]);
				hole.push(hole[0]);
				coords.push(hole);
			}
		}

		return L.GeoJSON.getFeature(this, {
			type: 'Polygon',
			coordinates: coords
		});
	}
});

(function () {
	function multiToGeoJSON(type) {
		return function () {
			var coords = [];

			this.eachLayer(function (layer) {
				coords.push(layer.toGeoJSON().geometry.coordinates);
			});

			return L.GeoJSON.getFeature(this, {
				type: type,
				coordinates: coords
			});
		};
	}

	L.MultiPolyline.include({toGeoJSON: multiToGeoJSON('MultiLineString')});
	L.MultiPolygon.include({toGeoJSON: multiToGeoJSON('MultiPolygon')});

	L.LayerGroup.include({
		toGeoJSON: function () {

			var geometry = this.feature && this.feature.geometry,
				jsons = [],
				json;

			if (geometry && geometry.type === 'MultiPoint') {
				return multiToGeoJSON('MultiPoint').call(this);
			}

			var isGeometryCollection = geometry && geometry.type === 'GeometryCollection';

			this.eachLayer(function (layer) {
				if (layer.toGeoJSON) {
					json = layer.toGeoJSON();
					jsons.push(isGeometryCollection ? json.geometry : L.GeoJSON.asFeature(json));
				}
			});

			if (isGeometryCollection) {
				return L.GeoJSON.getFeature(this, {
					geometries: jsons,
					type: 'GeometryCollection'
				});
			}

			return {
				type: 'FeatureCollection',
				features: jsons
			};
		}
	});
}());

L.geoJson = function (geojson, options) {
	return new L.GeoJSON(geojson, options);
};


/*
 * L.DomEvent contains functions for working with DOM events.
 */

L.DomEvent = {
	/* inspired by John Resig, Dean Edwards and YUI addEvent implementations */
	addListener: function (obj, type, fn, context) { // (HTMLElement, String, Function[, Object])

		var id = L.stamp(fn),
		    key = '_leaflet_' + type + id,
		    handler, originalHandler, newType;

		if (obj[key]) { return this; }

		handler = function (e) {
			return fn.call(context || obj, e || L.DomEvent._getEvent());
		};

		if (L.Browser.pointer && type.indexOf('touch') === 0) {
			return this.addPointerListener(obj, type, handler, id);
		}
		if (L.Browser.touch && (type === 'dblclick') && this.addDoubleTapListener) {
			this.addDoubleTapListener(obj, handler, id);
		}

		if ('addEventListener' in obj) {

			if (type === 'mousewheel') {
				obj.addEventListener('DOMMouseScroll', handler, false);
				obj.addEventListener(type, handler, false);

			} else if ((type === 'mouseenter') || (type === 'mouseleave')) {

				originalHandler = handler;
				newType = (type === 'mouseenter' ? 'mouseover' : 'mouseout');

				handler = function (e) {
					if (!L.DomEvent._checkMouse(obj, e)) { return; }
					return originalHandler(e);
				};

				obj.addEventListener(newType, handler, false);

			} else if (type === 'click' && L.Browser.android) {
				originalHandler = handler;
				handler = function (e) {
					return L.DomEvent._filterClick(e, originalHandler);
				};

				obj.addEventListener(type, handler, false);
			} else {
				obj.addEventListener(type, handler, false);
			}

		} else if ('attachEvent' in obj) {
			obj.attachEvent('on' + type, handler);
		}

		obj[key] = handler;

		return this;
	},

	removeListener: function (obj, type, fn) {  // (HTMLElement, String, Function)

		var id = L.stamp(fn),
		    key = '_leaflet_' + type + id,
		    handler = obj[key];

		if (!handler) { return this; }

		if (L.Browser.pointer && type.indexOf('touch') === 0) {
			this.removePointerListener(obj, type, id);
		} else if (L.Browser.touch && (type === 'dblclick') && this.removeDoubleTapListener) {
			this.removeDoubleTapListener(obj, id);

		} else if ('removeEventListener' in obj) {

			if (type === 'mousewheel') {
				obj.removeEventListener('DOMMouseScroll', handler, false);
				obj.removeEventListener(type, handler, false);

			} else if ((type === 'mouseenter') || (type === 'mouseleave')) {
				obj.removeEventListener((type === 'mouseenter' ? 'mouseover' : 'mouseout'), handler, false);
			} else {
				obj.removeEventListener(type, handler, false);
			}
		} else if ('detachEvent' in obj) {
			obj.detachEvent('on' + type, handler);
		}

		obj[key] = null;

		return this;
	},

	stopPropagation: function (e) {

		if (e.stopPropagation) {
			e.stopPropagation();
		} else {
			e.cancelBubble = true;
		}
		L.DomEvent._skipped(e);

		return this;
	},

	disableScrollPropagation: function (el) {
		var stop = L.DomEvent.stopPropagation;

		return L.DomEvent
			.on(el, 'mousewheel', stop)
			.on(el, 'MozMousePixelScroll', stop);
	},

	disableClickPropagation: function (el) {
		var stop = L.DomEvent.stopPropagation;

		for (var i = L.Draggable.START.length - 1; i >= 0; i--) {
			L.DomEvent.on(el, L.Draggable.START[i], stop);
		}

		return L.DomEvent
			.on(el, 'click', L.DomEvent._fakeStop)
			.on(el, 'dblclick', stop);
	},

	preventDefault: function (e) {

		if (e.preventDefault) {
			e.preventDefault();
		} else {
			e.returnValue = false;
		}
		return this;
	},

	stop: function (e) {
		return L.DomEvent
			.preventDefault(e)
			.stopPropagation(e);
	},

	getMousePosition: function (e, container) {
		if (!container) {
			return new L.Point(e.clientX, e.clientY);
		}

		var rect = container.getBoundingClientRect();

		return new L.Point(
			e.clientX - rect.left - container.clientLeft,
			e.clientY - rect.top - container.clientTop);
	},

	getWheelDelta: function (e) {

		var delta = 0;

		if (e.wheelDelta) {
			delta = e.wheelDelta / 120;
		}
		if (e.detail) {
			delta = -e.detail / 3;
		}
		return delta;
	},

	_skipEvents: {},

	_fakeStop: function (e) {
		// fakes stopPropagation by setting a special event flag, checked/reset with L.DomEvent._skipped(e)
		L.DomEvent._skipEvents[e.type] = true;
	},

	_skipped: function (e) {
		var skipped = this._skipEvents[e.type];
		// reset when checking, as it's only used in map container and propagates outside of the map
		this._skipEvents[e.type] = false;
		return skipped;
	},

	// check if element really left/entered the event target (for mouseenter/mouseleave)
	_checkMouse: function (el, e) {

		var related = e.relatedTarget;

		if (!related) { return true; }

		try {
			while (related && (related !== el)) {
				related = related.parentNode;
			}
		} catch (err) {
			return false;
		}
		return (related !== el);
	},

	_getEvent: function () { // evil magic for IE
		/*jshint noarg:false */
		var e = window.event;
		if (!e) {
			var caller = arguments.callee.caller;
			while (caller) {
				e = caller['arguments'][0];
				if (e && window.Event === e.constructor) {
					break;
				}
				caller = caller.caller;
			}
		}
		return e;
	},

	// this is a horrible workaround for a bug in Android where a single touch triggers two click events
	_filterClick: function (e, handler) {
		var timeStamp = (e.timeStamp || e.originalEvent.timeStamp),
			elapsed = L.DomEvent._lastClick && (timeStamp - L.DomEvent._lastClick);

		// are they closer together than 500ms yet more than 100ms?
		// Android typically triggers them ~300ms apart while multiple listeners
		// on the same event should be triggered far faster;
		// or check if click is simulated on the element, and if it is, reject any non-simulated events

		if ((elapsed && elapsed > 100 && elapsed < 500) || (e.target._simulatedClick && !e._simulated)) {
			L.DomEvent.stop(e);
			return;
		}
		L.DomEvent._lastClick = timeStamp;

		return handler(e);
	}
};

L.DomEvent.on = L.DomEvent.addListener;
L.DomEvent.off = L.DomEvent.removeListener;


/*
 * L.Draggable allows you to add dragging capabilities to any element. Supports mobile devices too.
 */

L.Draggable = L.Class.extend({
	includes: L.Mixin.Events,

	statics: {
		START: L.Browser.touch ? ['touchstart', 'mousedown'] : ['mousedown'],
		END: {
			mousedown: 'mouseup',
			touchstart: 'touchend',
			pointerdown: 'touchend',
			MSPointerDown: 'touchend'
		},
		MOVE: {
			mousedown: 'mousemove',
			touchstart: 'touchmove',
			pointerdown: 'touchmove',
			MSPointerDown: 'touchmove'
		}
	},

	initialize: function (element, dragStartTarget) {
		this._element = element;
		this._dragStartTarget = dragStartTarget || element;
	},

	enable: function () {
		if (this._enabled) { return; }

		for (var i = L.Draggable.START.length - 1; i >= 0; i--) {
			L.DomEvent.on(this._dragStartTarget, L.Draggable.START[i], this._onDown, this);
		}

		this._enabled = true;
	},

	disable: function () {
		if (!this._enabled) { return; }

		for (var i = L.Draggable.START.length - 1; i >= 0; i--) {
			L.DomEvent.off(this._dragStartTarget, L.Draggable.START[i], this._onDown, this);
		}

		this._enabled = false;
		this._moved = false;
	},

	_onDown: function (e) {
		this._moved = false;

		if (e.shiftKey || ((e.which !== 1) && (e.button !== 1) && !e.touches)) { return; }

		L.DomEvent.stopPropagation(e);

		if (L.Draggable._disabled) { return; }

		L.DomUtil.disableImageDrag();
		L.DomUtil.disableTextSelection();

		if (this._moving) { return; }

		var first = e.touches ? e.touches[0] : e;

		this._startPoint = new L.Point(first.clientX, first.clientY);
		this._startPos = this._newPos = L.DomUtil.getPosition(this._element);

		L.DomEvent
		    .on(document, L.Draggable.MOVE[e.type], this._onMove, this)
		    .on(document, L.Draggable.END[e.type], this._onUp, this);
	},

	_onMove: function (e) {
		if (e.touches && e.touches.length > 1) {
			this._moved = true;
			return;
		}

		var first = (e.touches && e.touches.length === 1 ? e.touches[0] : e),
		    newPoint = new L.Point(first.clientX, first.clientY),
		    offset = newPoint.subtract(this._startPoint);

		if (!offset.x && !offset.y) { return; }
		if (L.Browser.touch && Math.abs(offset.x) + Math.abs(offset.y) < 3) { return; }

		L.DomEvent.preventDefault(e);

		if (!this._moved) {
			this.fire('dragstart');

			this._moved = true;
			this._startPos = L.DomUtil.getPosition(this._element).subtract(offset);

			L.DomUtil.addClass(document.body, 'leaflet-dragging');
			this._lastTarget = e.target || e.srcElement;
			L.DomUtil.addClass(this._lastTarget, 'leaflet-drag-target');
		}

		this._newPos = this._startPos.add(offset);
		this._moving = true;

		L.Util.cancelAnimFrame(this._animRequest);
		this._animRequest = L.Util.requestAnimFrame(this._updatePosition, this, true, this._dragStartTarget);
	},

	_updatePosition: function () {
		this.fire('predrag');
		L.DomUtil.setPosition(this._element, this._newPos);
		this.fire('drag');
	},

	_onUp: function () {
		L.DomUtil.removeClass(document.body, 'leaflet-dragging');

		if (this._lastTarget) {
			L.DomUtil.removeClass(this._lastTarget, 'leaflet-drag-target');
			this._lastTarget = null;
		}

		for (var i in L.Draggable.MOVE) {
			L.DomEvent
			    .off(document, L.Draggable.MOVE[i], this._onMove)
			    .off(document, L.Draggable.END[i], this._onUp);
		}

		L.DomUtil.enableImageDrag();
		L.DomUtil.enableTextSelection();

		if (this._moved && this._moving) {
			// ensure drag is not fired after dragend
			L.Util.cancelAnimFrame(this._animRequest);

			this.fire('dragend', {
				distance: this._newPos.distanceTo(this._startPos)
			});
		}

		this._moving = false;
	}
});


/*
	L.Handler is a base class for handler classes that are used internally to inject
	interaction features like dragging to classes like Map and Marker.
*/

L.Handler = L.Class.extend({
	initialize: function (map) {
		this._map = map;
	},

	enable: function () {
		if (this._enabled) { return; }

		this._enabled = true;
		this.addHooks();
	},

	disable: function () {
		if (!this._enabled) { return; }

		this._enabled = false;
		this.removeHooks();
	},

	enabled: function () {
		return !!this._enabled;
	}
});


/*
 * L.Handler.MapDrag is used to make the map draggable (with panning inertia), enabled by default.
 */

L.Map.mergeOptions({
	dragging: true,

	inertia: !L.Browser.android23,
	inertiaDeceleration: 3400, // px/s^2
	inertiaMaxSpeed: Infinity, // px/s
	inertiaThreshold: L.Browser.touch ? 32 : 18, // ms
	easeLinearity: 0.25,

	// TODO refactor, move to CRS
	worldCopyJump: false
});

L.Map.Drag = L.Handler.extend({
	addHooks: function () {
		if (!this._draggable) {
			var map = this._map;

			this._draggable = new L.Draggable(map._mapPane, map._container);

			this._draggable.on({
				'dragstart': this._onDragStart,
				'drag': this._onDrag,
				'dragend': this._onDragEnd
			}, this);

			if (map.options.worldCopyJump) {
				this._draggable.on('predrag', this._onPreDrag, this);
				map.on('viewreset', this._onViewReset, this);

				map.whenReady(this._onViewReset, this);
			}
		}
		this._draggable.enable();
	},

	removeHooks: function () {
		this._draggable.disable();
	},

	moved: function () {
		return this._draggable && this._draggable._moved;
	},

	_onDragStart: function () {
		var map = this._map;

		if (map._panAnim) {
			map._panAnim.stop();
		}

		map
		    .fire('movestart')
		    .fire('dragstart');

		if (map.options.inertia) {
			this._positions = [];
			this._times = [];
		}
	},

	_onDrag: function () {
		if (this._map.options.inertia) {
			var time = this._lastTime = +new Date(),
			    pos = this._lastPos = this._draggable._newPos;

			this._positions.push(pos);
			this._times.push(time);

			if (time - this._times[0] > 200) {
				this._positions.shift();
				this._times.shift();
			}
		}

		this._map
		    .fire('move')
		    .fire('drag');
	},

	_onViewReset: function () {
		// TODO fix hardcoded Earth values
		var pxCenter = this._map.getSize()._divideBy(2),
		    pxWorldCenter = this._map.latLngToLayerPoint([0, 0]);

		this._initialWorldOffset = pxWorldCenter.subtract(pxCenter).x;
		this._worldWidth = this._map.project([0, 180]).x;
	},

	_onPreDrag: function () {
		// TODO refactor to be able to adjust map pane position after zoom
		var worldWidth = this._worldWidth,
		    halfWidth = Math.round(worldWidth / 2),
		    dx = this._initialWorldOffset,
		    x = this._draggable._newPos.x,
		    newX1 = (x - halfWidth + dx) % worldWidth + halfWidth - dx,
		    newX2 = (x + halfWidth + dx) % worldWidth - halfWidth - dx,
		    newX = Math.abs(newX1 + dx) < Math.abs(newX2 + dx) ? newX1 : newX2;

		this._draggable._newPos.x = newX;
	},

	_onDragEnd: function (e) {
		var map = this._map,
		    options = map.options,
		    delay = +new Date() - this._lastTime,

		    noInertia = !options.inertia || delay > options.inertiaThreshold || !this._positions[0];

		map.fire('dragend', e);

		if (noInertia) {
			map.fire('moveend');

		} else {

			var direction = this._lastPos.subtract(this._positions[0]),
			    duration = (this._lastTime + delay - this._times[0]) / 1000,
			    ease = options.easeLinearity,

			    speedVector = direction.multiplyBy(ease / duration),
			    speed = speedVector.distanceTo([0, 0]),

			    limitedSpeed = Math.min(options.inertiaMaxSpeed, speed),
			    limitedSpeedVector = speedVector.multiplyBy(limitedSpeed / speed),

			    decelerationDuration = limitedSpeed / (options.inertiaDeceleration * ease),
			    offset = limitedSpeedVector.multiplyBy(-decelerationDuration / 2).round();

			if (!offset.x || !offset.y) {
				map.fire('moveend');

			} else {
				offset = map._limitOffset(offset, map.options.maxBounds);

				L.Util.requestAnimFrame(function () {
					map.panBy(offset, {
						duration: decelerationDuration,
						easeLinearity: ease,
						noMoveStart: true
					});
				});
			}
		}
	}
});

L.Map.addInitHook('addHandler', 'dragging', L.Map.Drag);


/*
 * L.Handler.DoubleClickZoom is used to handle double-click zoom on the map, enabled by default.
 */

L.Map.mergeOptions({
	doubleClickZoom: true
});

L.Map.DoubleClickZoom = L.Handler.extend({
	addHooks: function () {
		this._map.on('dblclick', this._onDoubleClick, this);
	},

	removeHooks: function () {
		this._map.off('dblclick', this._onDoubleClick, this);
	},

	_onDoubleClick: function (e) {
		var map = this._map,
		    zoom = map.getZoom() + (e.originalEvent.shiftKey ? -1 : 1);

		if (map.options.doubleClickZoom === 'center') {
			map.setZoom(zoom);
		} else {
			map.setZoomAround(e.containerPoint, zoom);
		}
	}
});

L.Map.addInitHook('addHandler', 'doubleClickZoom', L.Map.DoubleClickZoom);


/*
 * L.Handler.ScrollWheelZoom is used by L.Map to enable mouse scroll wheel zoom on the map.
 */

L.Map.mergeOptions({
	scrollWheelZoom: true
});

L.Map.ScrollWheelZoom = L.Handler.extend({
	addHooks: function () {
		L.DomEvent.on(this._map._container, 'mousewheel', this._onWheelScroll, this);
		L.DomEvent.on(this._map._container, 'MozMousePixelScroll', L.DomEvent.preventDefault);
		this._delta = 0;
	},

	removeHooks: function () {
		L.DomEvent.off(this._map._container, 'mousewheel', this._onWheelScroll);
		L.DomEvent.off(this._map._container, 'MozMousePixelScroll', L.DomEvent.preventDefault);
	},

	_onWheelScroll: function (e) {
		var delta = L.DomEvent.getWheelDelta(e);

		this._delta += delta;
		this._lastMousePos = this._map.mouseEventToContainerPoint(e);

		if (!this._startTime) {
			this._startTime = +new Date();
		}

		var left = Math.max(40 - (+new Date() - this._startTime), 0);

		clearTimeout(this._timer);
		this._timer = setTimeout(L.bind(this._performZoom, this), left);

		L.DomEvent.preventDefault(e);
		L.DomEvent.stopPropagation(e);
	},

	_performZoom: function () {
		var map = this._map,
		    delta = this._delta,
		    zoom = map.getZoom();

		delta = delta > 0 ? Math.ceil(delta) : Math.floor(delta);
		delta = Math.max(Math.min(delta, 4), -4);
		delta = map._limitZoom(zoom + delta) - zoom;

		this._delta = 0;
		this._startTime = null;

		if (!delta) { return; }

		if (map.options.scrollWheelZoom === 'center') {
			map.setZoom(zoom + delta);
		} else {
			map.setZoomAround(this._lastMousePos, zoom + delta);
		}
	}
});

L.Map.addInitHook('addHandler', 'scrollWheelZoom', L.Map.ScrollWheelZoom);


/*
 * Extends the event handling code with double tap support for mobile browsers.
 */

L.extend(L.DomEvent, {

	_touchstart: L.Browser.msPointer ? 'MSPointerDown' : L.Browser.pointer ? 'pointerdown' : 'touchstart',
	_touchend: L.Browser.msPointer ? 'MSPointerUp' : L.Browser.pointer ? 'pointerup' : 'touchend',

	// inspired by Zepto touch code by Thomas Fuchs
	addDoubleTapListener: function (obj, handler, id) {
		var last,
		    doubleTap = false,
		    delay = 250,
		    touch,
		    pre = '_leaflet_',
		    touchstart = this._touchstart,
		    touchend = this._touchend,
		    trackedTouches = [];

		function onTouchStart(e) {
			var count;

			if (L.Browser.pointer) {
				trackedTouches.push(e.pointerId);
				count = trackedTouches.length;
			} else {
				count = e.touches.length;
			}
			if (count > 1) {
				return;
			}

			var now = Date.now(),
				delta = now - (last || now);

			touch = e.touches ? e.touches[0] : e;
			doubleTap = (delta > 0 && delta <= delay);
			last = now;
		}

		function onTouchEnd(e) {
			if (L.Browser.pointer) {
				var idx = trackedTouches.indexOf(e.pointerId);
				if (idx === -1) {
					return;
				}
				trackedTouches.splice(idx, 1);
			}

			if (doubleTap) {
				if (L.Browser.pointer) {
					// work around .type being readonly with MSPointer* events
					var newTouch = { },
						prop;

					// jshint forin:false
					for (var i in touch) {
						prop = touch[i];
						if (typeof prop === 'function') {
							newTouch[i] = prop.bind(touch);
						} else {
							newTouch[i] = prop;
						}
					}
					touch = newTouch;
				}
				touch.type = 'dblclick';
				handler(touch);
				last = null;
			}
		}
		obj[pre + touchstart + id] = onTouchStart;
		obj[pre + touchend + id] = onTouchEnd;

		// on pointer we need to listen on the document, otherwise a drag starting on the map and moving off screen
		// will not come through to us, so we will lose track of how many touches are ongoing
		var endElement = L.Browser.pointer ? document.documentElement : obj;

		obj.addEventListener(touchstart, onTouchStart, false);
		endElement.addEventListener(touchend, onTouchEnd, false);

		if (L.Browser.pointer) {
			endElement.addEventListener(L.DomEvent.POINTER_CANCEL, onTouchEnd, false);
		}

		return this;
	},

	removeDoubleTapListener: function (obj, id) {
		var pre = '_leaflet_';

		obj.removeEventListener(this._touchstart, obj[pre + this._touchstart + id], false);
		(L.Browser.pointer ? document.documentElement : obj).removeEventListener(
		        this._touchend, obj[pre + this._touchend + id], false);

		if (L.Browser.pointer) {
			document.documentElement.removeEventListener(L.DomEvent.POINTER_CANCEL, obj[pre + this._touchend + id],
				false);
		}

		return this;
	}
});


/*
 * Extends L.DomEvent to provide touch support for Internet Explorer and Windows-based devices.
 */

L.extend(L.DomEvent, {

	//static
	POINTER_DOWN: L.Browser.msPointer ? 'MSPointerDown' : 'pointerdown',
	POINTER_MOVE: L.Browser.msPointer ? 'MSPointerMove' : 'pointermove',
	POINTER_UP: L.Browser.msPointer ? 'MSPointerUp' : 'pointerup',
	POINTER_CANCEL: L.Browser.msPointer ? 'MSPointerCancel' : 'pointercancel',

	_pointers: [],
	_pointerDocumentListener: false,

	// Provides a touch events wrapper for (ms)pointer events.
	// Based on changes by veproza https://github.com/CloudMade/Leaflet/pull/1019
	//ref http://www.w3.org/TR/pointerevents/ https://www.w3.org/Bugs/Public/show_bug.cgi?id=22890

	addPointerListener: function (obj, type, handler, id) {

		switch (type) {
		case 'touchstart':
			return this.addPointerListenerStart(obj, type, handler, id);
		case 'touchend':
			return this.addPointerListenerEnd(obj, type, handler, id);
		case 'touchmove':
			return this.addPointerListenerMove(obj, type, handler, id);
		default:
			throw 'Unknown touch event type';
		}
	},

	addPointerListenerStart: function (obj, type, handler, id) {
		var pre = '_leaflet_',
		    pointers = this._pointers;

		var cb = function (e) {

			L.DomEvent.preventDefault(e);

			var alreadyInArray = false;
			for (var i = 0; i < pointers.length; i++) {
				if (pointers[i].pointerId === e.pointerId) {
					alreadyInArray = true;
					break;
				}
			}
			if (!alreadyInArray) {
				pointers.push(e);
			}

			e.touches = pointers.slice();
			e.changedTouches = [e];

			handler(e);
		};

		obj[pre + 'touchstart' + id] = cb;
		obj.addEventListener(this.POINTER_DOWN, cb, false);

		// need to also listen for end events to keep the _pointers list accurate
		// this needs to be on the body and never go away
		if (!this._pointerDocumentListener) {
			var internalCb = function (e) {
				for (var i = 0; i < pointers.length; i++) {
					if (pointers[i].pointerId === e.pointerId) {
						pointers.splice(i, 1);
						break;
					}
				}
			};
			//We listen on the documentElement as any drags that end by moving the touch off the screen get fired there
			document.documentElement.addEventListener(this.POINTER_UP, internalCb, false);
			document.documentElement.addEventListener(this.POINTER_CANCEL, internalCb, false);

			this._pointerDocumentListener = true;
		}

		return this;
	},

	addPointerListenerMove: function (obj, type, handler, id) {
		var pre = '_leaflet_',
		    touches = this._pointers;

		function cb(e) {

			// don't fire touch moves when mouse isn't down
			if ((e.pointerType === e.MSPOINTER_TYPE_MOUSE || e.pointerType === 'mouse') && e.buttons === 0) { return; }

			for (var i = 0; i < touches.length; i++) {
				if (touches[i].pointerId === e.pointerId) {
					touches[i] = e;
					break;
				}
			}

			e.touches = touches.slice();
			e.changedTouches = [e];

			handler(e);
		}

		obj[pre + 'touchmove' + id] = cb;
		obj.addEventListener(this.POINTER_MOVE, cb, false);

		return this;
	},

	addPointerListenerEnd: function (obj, type, handler, id) {
		var pre = '_leaflet_',
		    touches = this._pointers;

		var cb = function (e) {
			for (var i = 0; i < touches.length; i++) {
				if (touches[i].pointerId === e.pointerId) {
					touches.splice(i, 1);
					break;
				}
			}

			e.touches = touches.slice();
			e.changedTouches = [e];

			handler(e);
		};

		obj[pre + 'touchend' + id] = cb;
		obj.addEventListener(this.POINTER_UP, cb, false);
		obj.addEventListener(this.POINTER_CANCEL, cb, false);

		return this;
	},

	removePointerListener: function (obj, type, id) {
		var pre = '_leaflet_',
		    cb = obj[pre + type + id];

		switch (type) {
		case 'touchstart':
			obj.removeEventListener(this.POINTER_DOWN, cb, false);
			break;
		case 'touchmove':
			obj.removeEventListener(this.POINTER_MOVE, cb, false);
			break;
		case 'touchend':
			obj.removeEventListener(this.POINTER_UP, cb, false);
			obj.removeEventListener(this.POINTER_CANCEL, cb, false);
			break;
		}

		return this;
	}
});


/*
 * L.Handler.TouchZoom is used by L.Map to add pinch zoom on supported mobile browsers.
 */

L.Map.mergeOptions({
	touchZoom: L.Browser.touch && !L.Browser.android23,
	bounceAtZoomLimits: true
});

L.Map.TouchZoom = L.Handler.extend({
	addHooks: function () {
		L.DomEvent.on(this._map._container, 'touchstart', this._onTouchStart, this);
	},

	removeHooks: function () {
		L.DomEvent.off(this._map._container, 'touchstart', this._onTouchStart, this);
	},

	_onTouchStart: function (e) {
		var map = this._map;

		if (!e.touches || e.touches.length !== 2 || map._animatingZoom || this._zooming) { return; }

		var p1 = map.mouseEventToLayerPoint(e.touches[0]),
		    p2 = map.mouseEventToLayerPoint(e.touches[1]),
		    viewCenter = map._getCenterLayerPoint();

		this._startCenter = p1.add(p2)._divideBy(2);
		this._startDist = p1.distanceTo(p2);

		this._moved = false;
		this._zooming = true;

		this._centerOffset = viewCenter.subtract(this._startCenter);

		if (map._panAnim) {
			map._panAnim.stop();
		}

		L.DomEvent
		    .on(document, 'touchmove', this._onTouchMove, this)
		    .on(document, 'touchend', this._onTouchEnd, this);

		L.DomEvent.preventDefault(e);
	},

	_onTouchMove: function (e) {
		var map = this._map;

		if (!e.touches || e.touches.length !== 2 || !this._zooming) { return; }

		var p1 = map.mouseEventToLayerPoint(e.touches[0]),
		    p2 = map.mouseEventToLayerPoint(e.touches[1]);

		this._scale = p1.distanceTo(p2) / this._startDist;
		this._delta = p1._add(p2)._divideBy(2)._subtract(this._startCenter);

		if (this._scale === 1) { return; }

		if (!map.options.bounceAtZoomLimits) {
			if ((map.getZoom() === map.getMinZoom() && this._scale < 1) ||
			    (map.getZoom() === map.getMaxZoom() && this._scale > 1)) { return; }
		}

		if (!this._moved) {
			L.DomUtil.addClass(map._mapPane, 'leaflet-touching');

			map
			    .fire('movestart')
			    .fire('zoomstart');

			this._moved = true;
		}

		L.Util.cancelAnimFrame(this._animRequest);
		this._animRequest = L.Util.requestAnimFrame(
		        this._updateOnMove, this, true, this._map._container);

		L.DomEvent.preventDefault(e);
	},

	_updateOnMove: function () {
		var map = this._map,
		    origin = this._getScaleOrigin(),
		    center = map.layerPointToLatLng(origin),
		    zoom = map.getScaleZoom(this._scale);

		map._animateZoom(center, zoom, this._startCenter, this._scale, this._delta, false, true);
	},

	_onTouchEnd: function () {
		if (!this._moved || !this._zooming) {
			this._zooming = false;
			return;
		}

		var map = this._map;

		this._zooming = false;
		L.DomUtil.removeClass(map._mapPane, 'leaflet-touching');
		L.Util.cancelAnimFrame(this._animRequest);

		L.DomEvent
		    .off(document, 'touchmove', this._onTouchMove)
		    .off(document, 'touchend', this._onTouchEnd);

		var origin = this._getScaleOrigin(),
		    center = map.layerPointToLatLng(origin),

		    oldZoom = map.getZoom(),
		    floatZoomDelta = map.getScaleZoom(this._scale) - oldZoom,
		    roundZoomDelta = (floatZoomDelta > 0 ?
		            Math.ceil(floatZoomDelta) : Math.floor(floatZoomDelta)),

		    zoom = map._limitZoom(oldZoom + roundZoomDelta),
		    scale = map.getZoomScale(zoom) / this._scale;

		map._animateZoom(center, zoom, origin, scale);
	},

	_getScaleOrigin: function () {
		var centerOffset = this._centerOffset.subtract(this._delta).divideBy(this._scale);
		return this._startCenter.add(centerOffset);
	}
});

L.Map.addInitHook('addHandler', 'touchZoom', L.Map.TouchZoom);


/*
 * L.Map.Tap is used to enable mobile hacks like quick taps and long hold.
 */

L.Map.mergeOptions({
	tap: true,
	tapTolerance: 15
});

L.Map.Tap = L.Handler.extend({
	addHooks: function () {
		L.DomEvent.on(this._map._container, 'touchstart', this._onDown, this);
	},

	removeHooks: function () {
		L.DomEvent.off(this._map._container, 'touchstart', this._onDown, this);
	},

	_onDown: function (e) {
		if (!e.touches) { return; }

		L.DomEvent.preventDefault(e);

		this._fireClick = true;

		// don't simulate click or track longpress if more than 1 touch
		if (e.touches.length > 1) {
			this._fireClick = false;
			clearTimeout(this._holdTimeout);
			return;
		}

		var first = e.touches[0],
		    el = first.target;

		this._startPos = this._newPos = new L.Point(first.clientX, first.clientY);

		// if touching a link, highlight it
		if (el.tagName && el.tagName.toLowerCase() === 'a') {
			L.DomUtil.addClass(el, 'leaflet-active');
		}

		// simulate long hold but setting a timeout
		this._holdTimeout = setTimeout(L.bind(function () {
			if (this._isTapValid()) {
				this._fireClick = false;
				this._onUp();
				this._simulateEvent('contextmenu', first);
			}
		}, this), 1000);

		L.DomEvent
			.on(document, 'touchmove', this._onMove, this)
			.on(document, 'touchend', this._onUp, this);
	},

	_onUp: function (e) {
		clearTimeout(this._holdTimeout);

		L.DomEvent
			.off(document, 'touchmove', this._onMove, this)
			.off(document, 'touchend', this._onUp, this);

		if (this._fireClick && e && e.changedTouches) {

			var first = e.changedTouches[0],
			    el = first.target;

			if (el && el.tagName && el.tagName.toLowerCase() === 'a') {
				L.DomUtil.removeClass(el, 'leaflet-active');
			}

			// simulate click if the touch didn't move too much
			if (this._isTapValid()) {
				this._simulateEvent('click', first);
			}
		}
	},

	_isTapValid: function () {
		return this._newPos.distanceTo(this._startPos) <= this._map.options.tapTolerance;
	},

	_onMove: function (e) {
		var first = e.touches[0];
		this._newPos = new L.Point(first.clientX, first.clientY);
	},

	_simulateEvent: function (type, e) {
		var simulatedEvent = document.createEvent('MouseEvents');

		simulatedEvent._simulated = true;
		e.target._simulatedClick = true;

		simulatedEvent.initMouseEvent(
		        type, true, true, window, 1,
		        e.screenX, e.screenY,
		        e.clientX, e.clientY,
		        false, false, false, false, 0, null);

		e.target.dispatchEvent(simulatedEvent);
	}
});

if (L.Browser.touch && !L.Browser.pointer) {
	L.Map.addInitHook('addHandler', 'tap', L.Map.Tap);
}


/*
 * L.Handler.ShiftDragZoom is used to add shift-drag zoom interaction to the map
  * (zoom to a selected bounding box), enabled by default.
 */

L.Map.mergeOptions({
	boxZoom: true
});

L.Map.BoxZoom = L.Handler.extend({
	initialize: function (map) {
		this._map = map;
		this._container = map._container;
		this._pane = map._panes.overlayPane;
		this._moved = false;
	},

	addHooks: function () {
		L.DomEvent.on(this._container, 'mousedown', this._onMouseDown, this);
	},

	removeHooks: function () {
		L.DomEvent.off(this._container, 'mousedown', this._onMouseDown);
		this._moved = false;
	},

	moved: function () {
		return this._moved;
	},

	_onMouseDown: function (e) {
		this._moved = false;

		if (!e.shiftKey || ((e.which !== 1) && (e.button !== 1))) { return false; }

		L.DomUtil.disableTextSelection();
		L.DomUtil.disableImageDrag();

		this._startLayerPoint = this._map.mouseEventToLayerPoint(e);

		L.DomEvent
		    .on(document, 'mousemove', this._onMouseMove, this)
		    .on(document, 'mouseup', this._onMouseUp, this)
		    .on(document, 'keydown', this._onKeyDown, this);
	},

	_onMouseMove: function (e) {
		if (!this._moved) {
			this._box = L.DomUtil.create('div', 'leaflet-zoom-box', this._pane);
			L.DomUtil.setPosition(this._box, this._startLayerPoint);

			//TODO refactor: move cursor to styles
			this._container.style.cursor = 'crosshair';
			this._map.fire('boxzoomstart');
		}

		var startPoint = this._startLayerPoint,
		    box = this._box,

		    layerPoint = this._map.mouseEventToLayerPoint(e),
		    offset = layerPoint.subtract(startPoint),

		    newPos = new L.Point(
		        Math.min(layerPoint.x, startPoint.x),
		        Math.min(layerPoint.y, startPoint.y));

		L.DomUtil.setPosition(box, newPos);

		this._moved = true;

		// TODO refactor: remove hardcoded 4 pixels
		box.style.width  = (Math.max(0, Math.abs(offset.x) - 4)) + 'px';
		box.style.height = (Math.max(0, Math.abs(offset.y) - 4)) + 'px';
	},

	_finish: function () {
		if (this._moved) {
			this._pane.removeChild(this._box);
			this._container.style.cursor = '';
		}

		L.DomUtil.enableTextSelection();
		L.DomUtil.enableImageDrag();

		L.DomEvent
		    .off(document, 'mousemove', this._onMouseMove)
		    .off(document, 'mouseup', this._onMouseUp)
		    .off(document, 'keydown', this._onKeyDown);
	},

	_onMouseUp: function (e) {

		this._finish();

		var map = this._map,
		    layerPoint = map.mouseEventToLayerPoint(e);

		if (this._startLayerPoint.equals(layerPoint)) { return; }

		var bounds = new L.LatLngBounds(
		        map.layerPointToLatLng(this._startLayerPoint),
		        map.layerPointToLatLng(layerPoint));

		map.fitBounds(bounds);

		map.fire('boxzoomend', {
			boxZoomBounds: bounds
		});
	},

	_onKeyDown: function (e) {
		if (e.keyCode === 27) {
			this._finish();
		}
	}
});

L.Map.addInitHook('addHandler', 'boxZoom', L.Map.BoxZoom);


/*
 * L.Map.Keyboard is handling keyboard interaction with the map, enabled by default.
 */

L.Map.mergeOptions({
	keyboard: true,
	keyboardPanOffset: 80,
	keyboardZoomOffset: 1
});

L.Map.Keyboard = L.Handler.extend({

	keyCodes: {
		left:    [37],
		right:   [39],
		down:    [40],
		up:      [38],
		zoomIn:  [187, 107, 61, 171],
		zoomOut: [189, 109, 173]
	},

	initialize: function (map) {
		this._map = map;

		this._setPanOffset(map.options.keyboardPanOffset);
		this._setZoomOffset(map.options.keyboardZoomOffset);
	},

	addHooks: function () {
		var container = this._map._container;

		// make the container focusable by tabbing
		if (container.tabIndex === -1) {
			container.tabIndex = '0';
		}

		L.DomEvent
		    .on(container, 'focus', this._onFocus, this)
		    .on(container, 'blur', this._onBlur, this)
		    .on(container, 'mousedown', this._onMouseDown, this);

		this._map
		    .on('focus', this._addHooks, this)
		    .on('blur', this._removeHooks, this);
	},

	removeHooks: function () {
		this._removeHooks();

		var container = this._map._container;

		L.DomEvent
		    .off(container, 'focus', this._onFocus, this)
		    .off(container, 'blur', this._onBlur, this)
		    .off(container, 'mousedown', this._onMouseDown, this);

		this._map
		    .off('focus', this._addHooks, this)
		    .off('blur', this._removeHooks, this);
	},

	_onMouseDown: function () {
		if (this._focused) { return; }

		var body = document.body,
		    docEl = document.documentElement,
		    top = body.scrollTop || docEl.scrollTop,
		    left = body.scrollLeft || docEl.scrollLeft;

		this._map._container.focus();

		window.scrollTo(left, top);
	},

	_onFocus: function () {
		this._focused = true;
		this._map.fire('focus');
	},

	_onBlur: function () {
		this._focused = false;
		this._map.fire('blur');
	},

	_setPanOffset: function (pan) {
		var keys = this._panKeys = {},
		    codes = this.keyCodes,
		    i, len;

		for (i = 0, len = codes.left.length; i < len; i++) {
			keys[codes.left[i]] = [-1 * pan, 0];
		}
		for (i = 0, len = codes.right.length; i < len; i++) {
			keys[codes.right[i]] = [pan, 0];
		}
		for (i = 0, len = codes.down.length; i < len; i++) {
			keys[codes.down[i]] = [0, pan];
		}
		for (i = 0, len = codes.up.length; i < len; i++) {
			keys[codes.up[i]] = [0, -1 * pan];
		}
	},

	_setZoomOffset: function (zoom) {
		var keys = this._zoomKeys = {},
		    codes = this.keyCodes,
		    i, len;

		for (i = 0, len = codes.zoomIn.length; i < len; i++) {
			keys[codes.zoomIn[i]] = zoom;
		}
		for (i = 0, len = codes.zoomOut.length; i < len; i++) {
			keys[codes.zoomOut[i]] = -zoom;
		}
	},

	_addHooks: function () {
		L.DomEvent.on(document, 'keydown', this._onKeyDown, this);
	},

	_removeHooks: function () {
		L.DomEvent.off(document, 'keydown', this._onKeyDown, this);
	},

	_onKeyDown: function (e) {
		var key = e.keyCode,
		    map = this._map;

		if (key in this._panKeys) {

			if (map._panAnim && map._panAnim._inProgress) { return; }

			map.panBy(this._panKeys[key]);

			if (map.options.maxBounds) {
				map.panInsideBounds(map.options.maxBounds);
			}

		} else if (key in this._zoomKeys) {
			map.setZoom(map.getZoom() + this._zoomKeys[key]);

		} else {
			return;
		}

		L.DomEvent.stop(e);
	}
});

L.Map.addInitHook('addHandler', 'keyboard', L.Map.Keyboard);


/*
 * L.Handler.MarkerDrag is used internally by L.Marker to make the markers draggable.
 */

L.Handler.MarkerDrag = L.Handler.extend({
	initialize: function (marker) {
		this._marker = marker;
	},

	addHooks: function () {
		var icon = this._marker._icon;
		if (!this._draggable) {
			this._draggable = new L.Draggable(icon, icon);
		}

		this._draggable
			.on('dragstart', this._onDragStart, this)
			.on('drag', this._onDrag, this)
			.on('dragend', this._onDragEnd, this);
		this._draggable.enable();
		L.DomUtil.addClass(this._marker._icon, 'leaflet-marker-draggable');
	},

	removeHooks: function () {
		this._draggable
			.off('dragstart', this._onDragStart, this)
			.off('drag', this._onDrag, this)
			.off('dragend', this._onDragEnd, this);

		this._draggable.disable();
		L.DomUtil.removeClass(this._marker._icon, 'leaflet-marker-draggable');
	},

	moved: function () {
		return this._draggable && this._draggable._moved;
	},

	_onDragStart: function () {
		this._marker
		    .closePopup()
		    .fire('movestart')
		    .fire('dragstart');
	},

	_onDrag: function () {
		var marker = this._marker,
		    shadow = marker._shadow,
		    iconPos = L.DomUtil.getPosition(marker._icon),
		    latlng = marker._map.layerPointToLatLng(iconPos);

		// update shadow position
		if (shadow) {
			L.DomUtil.setPosition(shadow, iconPos);
		}

		marker._latlng = latlng;

		marker
		    .fire('move', {latlng: latlng})
		    .fire('drag');
	},

	_onDragEnd: function (e) {
		this._marker
		    .fire('moveend')
		    .fire('dragend', e);
	}
});


/*
 * L.Control is a base class for implementing map controls. Handles positioning.
 * All other controls extend from this class.
 */

L.Control = L.Class.extend({
	options: {
		position: 'topright'
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	getPosition: function () {
		return this.options.position;
	},

	setPosition: function (position) {
		var map = this._map;

		if (map) {
			map.removeControl(this);
		}

		this.options.position = position;

		if (map) {
			map.addControl(this);
		}

		return this;
	},

	getContainer: function () {
		return this._container;
	},

	addTo: function (map) {
		this._map = map;

		var container = this._container = this.onAdd(map),
		    pos = this.getPosition(),
		    corner = map._controlCorners[pos];

		L.DomUtil.addClass(container, 'leaflet-control');

		if (pos.indexOf('bottom') !== -1) {
			corner.insertBefore(container, corner.firstChild);
		} else {
			corner.appendChild(container);
		}

		return this;
	},

	removeFrom: function (map) {
		var pos = this.getPosition(),
		    corner = map._controlCorners[pos];

		corner.removeChild(this._container);
		this._map = null;

		if (this.onRemove) {
			this.onRemove(map);
		}

		return this;
	},

	_refocusOnMap: function () {
		if (this._map) {
			this._map.getContainer().focus();
		}
	}
});

L.control = function (options) {
	return new L.Control(options);
};


// adds control-related methods to L.Map

L.Map.include({
	addControl: function (control) {
		control.addTo(this);
		return this;
	},

	removeControl: function (control) {
		control.removeFrom(this);
		return this;
	},

	_initControlPos: function () {
		var corners = this._controlCorners = {},
		    l = 'leaflet-',
		    container = this._controlContainer =
		            L.DomUtil.create('div', l + 'control-container', this._container);

		function createCorner(vSide, hSide) {
			var className = l + vSide + ' ' + l + hSide;

			corners[vSide + hSide] = L.DomUtil.create('div', className, container);
		}

		createCorner('top', 'left');
		createCorner('top', 'right');
		createCorner('bottom', 'left');
		createCorner('bottom', 'right');
	},

	_clearControlPos: function () {
		this._container.removeChild(this._controlContainer);
	}
});


/*
 * L.Control.Zoom is used for the default zoom buttons on the map.
 */

L.Control.Zoom = L.Control.extend({
	options: {
		position: 'topleft',
		zoomInText: '+',
		zoomInTitle: 'Zoom in',
		zoomOutText: '-',
		zoomOutTitle: 'Zoom out'
	},

	onAdd: function (map) {
		var zoomName = 'leaflet-control-zoom',
		    container = L.DomUtil.create('div', zoomName + ' leaflet-bar');

		this._map = map;

		this._zoomInButton  = this._createButton(
		        this.options.zoomInText, this.options.zoomInTitle,
		        zoomName + '-in',  container, this._zoomIn,  this);
		this._zoomOutButton = this._createButton(
		        this.options.zoomOutText, this.options.zoomOutTitle,
		        zoomName + '-out', container, this._zoomOut, this);

		this._updateDisabled();
		map.on('zoomend zoomlevelschange', this._updateDisabled, this);

		return container;
	},

	onRemove: function (map) {
		map.off('zoomend zoomlevelschange', this._updateDisabled, this);
	},

	_zoomIn: function (e) {
		this._map.zoomIn(e.shiftKey ? 3 : 1);
	},

	_zoomOut: function (e) {
		this._map.zoomOut(e.shiftKey ? 3 : 1);
	},

	_createButton: function (html, title, className, container, fn, context) {
		var link = L.DomUtil.create('a', className, container);
		link.innerHTML = html;
		link.href = '#';
		link.title = title;

		var stop = L.DomEvent.stopPropagation;

		L.DomEvent
		    .on(link, 'click', stop)
		    .on(link, 'mousedown', stop)
		    .on(link, 'dblclick', stop)
		    .on(link, 'click', L.DomEvent.preventDefault)
		    .on(link, 'click', fn, context)
		    .on(link, 'click', this._refocusOnMap, context);

		return link;
	},

	_updateDisabled: function () {
		var map = this._map,
			className = 'leaflet-disabled';

		L.DomUtil.removeClass(this._zoomInButton, className);
		L.DomUtil.removeClass(this._zoomOutButton, className);

		if (map._zoom === map.getMinZoom()) {
			L.DomUtil.addClass(this._zoomOutButton, className);
		}
		if (map._zoom === map.getMaxZoom()) {
			L.DomUtil.addClass(this._zoomInButton, className);
		}
	}
});

L.Map.mergeOptions({
	zoomControl: true
});

L.Map.addInitHook(function () {
	if (this.options.zoomControl) {
		this.zoomControl = new L.Control.Zoom();
		this.addControl(this.zoomControl);
	}
});

L.control.zoom = function (options) {
	return new L.Control.Zoom(options);
};



/*
 * L.Control.Attribution is used for displaying attribution on the map (added by default).
 */

L.Control.Attribution = L.Control.extend({
	options: {
		position: 'bottomright',
		prefix: '<a href="http://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>'
	},

	initialize: function (options) {
		L.setOptions(this, options);

		this._attributions = {};
	},

	onAdd: function (map) {
		this._container = L.DomUtil.create('div', 'leaflet-control-attribution');
		L.DomEvent.disableClickPropagation(this._container);

		for (var i in map._layers) {
			if (map._layers[i].getAttribution) {
				this.addAttribution(map._layers[i].getAttribution());
			}
		}
		
		map
		    .on('layeradd', this._onLayerAdd, this)
		    .on('layerremove', this._onLayerRemove, this);

		this._update();

		return this._container;
	},

	onRemove: function (map) {
		map
		    .off('layeradd', this._onLayerAdd)
		    .off('layerremove', this._onLayerRemove);

	},

	setPrefix: function (prefix) {
		this.options.prefix = prefix;
		this._update();
		return this;
	},

	addAttribution: function (text) {
		if (!text) { return; }

		if (!this._attributions[text]) {
			this._attributions[text] = 0;
		}
		this._attributions[text]++;

		this._update();

		return this;
	},

	removeAttribution: function (text) {
		if (!text) { return; }

		if (this._attributions[text]) {
			this._attributions[text]--;
			this._update();
		}

		return this;
	},

	_update: function () {
		if (!this._map) { return; }

		var attribs = [];

		for (var i in this._attributions) {
			if (this._attributions[i]) {
				attribs.push(i);
			}
		}

		var prefixAndAttribs = [];

		if (this.options.prefix) {
			prefixAndAttribs.push(this.options.prefix);
		}
		if (attribs.length) {
			prefixAndAttribs.push(attribs.join(', '));
		}

		this._container.innerHTML = prefixAndAttribs.join(' | ');
	},

	_onLayerAdd: function (e) {
		if (e.layer.getAttribution) {
			this.addAttribution(e.layer.getAttribution());
		}
	},

	_onLayerRemove: function (e) {
		if (e.layer.getAttribution) {
			this.removeAttribution(e.layer.getAttribution());
		}
	}
});

L.Map.mergeOptions({
	attributionControl: true
});

L.Map.addInitHook(function () {
	if (this.options.attributionControl) {
		this.attributionControl = (new L.Control.Attribution()).addTo(this);
	}
});

L.control.attribution = function (options) {
	return new L.Control.Attribution(options);
};


/*
 * L.Control.Scale is used for displaying metric/imperial scale on the map.
 */

L.Control.Scale = L.Control.extend({
	options: {
		position: 'bottomleft',
		maxWidth: 100,
		metric: true,
		imperial: true,
		updateWhenIdle: false
	},

	onAdd: function (map) {
		this._map = map;

		var className = 'leaflet-control-scale',
		    container = L.DomUtil.create('div', className),
		    options = this.options;

		this._addScales(options, className, container);

		map.on(options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
		map.whenReady(this._update, this);

		return container;
	},

	onRemove: function (map) {
		map.off(this.options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
	},

	_addScales: function (options, className, container) {
		if (options.metric) {
			this._mScale = L.DomUtil.create('div', className + '-line', container);
		}
		if (options.imperial) {
			this._iScale = L.DomUtil.create('div', className + '-line', container);
		}
	},

	_update: function () {
		var bounds = this._map.getBounds(),
		    centerLat = bounds.getCenter().lat,
		    halfWorldMeters = 6378137 * Math.PI * Math.cos(centerLat * Math.PI / 180),
		    dist = halfWorldMeters * (bounds.getNorthEast().lng - bounds.getSouthWest().lng) / 180,

		    size = this._map.getSize(),
		    options = this.options,
		    maxMeters = 0;

		if (size.x > 0) {
			maxMeters = dist * (options.maxWidth / size.x);
		}

		this._updateScales(options, maxMeters);
	},

	_updateScales: function (options, maxMeters) {
		if (options.metric && maxMeters) {
			this._updateMetric(maxMeters);
		}

		if (options.imperial && maxMeters) {
			this._updateImperial(maxMeters);
		}
	},

	_updateMetric: function (maxMeters) {
		var meters = this._getRoundNum(maxMeters);

		this._mScale.style.width = this._getScaleWidth(meters / maxMeters) + 'px';
		this._mScale.innerHTML = meters < 1000 ? meters + ' m' : (meters / 1000) + ' km';
	},

	_updateImperial: function (maxMeters) {
		var maxFeet = maxMeters * 3.2808399,
		    scale = this._iScale,
		    maxMiles, miles, feet;

		if (maxFeet > 5280) {
			maxMiles = maxFeet / 5280;
			miles = this._getRoundNum(maxMiles);

			scale.style.width = this._getScaleWidth(miles / maxMiles) + 'px';
			scale.innerHTML = miles + ' mi';

		} else {
			feet = this._getRoundNum(maxFeet);

			scale.style.width = this._getScaleWidth(feet / maxFeet) + 'px';
			scale.innerHTML = feet + ' ft';
		}
	},

	_getScaleWidth: function (ratio) {
		return Math.round(this.options.maxWidth * ratio) - 10;
	},

	_getRoundNum: function (num) {
		var pow10 = Math.pow(10, (Math.floor(num) + '').length - 1),
		    d = num / pow10;

		d = d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1;

		return pow10 * d;
	}
});

L.control.scale = function (options) {
	return new L.Control.Scale(options);
};


/*
 * L.Control.Layers is a control to allow users to switch between different layers on the map.
 */

L.Control.Layers = L.Control.extend({
	options: {
		collapsed: true,
		position: 'topright',
		autoZIndex: true
	},

	initialize: function (baseLayers, overlays, options) {
		L.setOptions(this, options);

		this._layers = {};
		this._lastZIndex = 0;
		this._handlingClick = false;

		for (var i in baseLayers) {
			this._addLayer(baseLayers[i], i);
		}

		for (i in overlays) {
			this._addLayer(overlays[i], i, true);
		}
	},

	onAdd: function (map) {
		this._initLayout();
		this._update();

		map
		    .on('layeradd', this._onLayerChange, this)
		    .on('layerremove', this._onLayerChange, this);

		return this._container;
	},

	onRemove: function (map) {
		map
		    .off('layeradd', this._onLayerChange, this)
		    .off('layerremove', this._onLayerChange, this);
	},

	addBaseLayer: function (layer, name) {
		this._addLayer(layer, name);
		this._update();
		return this;
	},

	addOverlay: function (layer, name) {
		this._addLayer(layer, name, true);
		this._update();
		return this;
	},

	removeLayer: function (layer) {
		var id = L.stamp(layer);
		delete this._layers[id];
		this._update();
		return this;
	},

	_initLayout: function () {
		var className = 'leaflet-control-layers',
		    container = this._container = L.DomUtil.create('div', className);

		//Makes this work on IE10 Touch devices by stopping it from firing a mouseout event when the touch is released
		container.setAttribute('aria-haspopup', true);

		if (!L.Browser.touch) {
			L.DomEvent
				.disableClickPropagation(container)
				.disableScrollPropagation(container);
		} else {
			L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation);
		}

		var form = this._form = L.DomUtil.create('form', className + '-list');

		if (this.options.collapsed) {
			if (!L.Browser.android) {
				L.DomEvent
				    .on(container, 'mouseover', this._expand, this)
				    .on(container, 'mouseout', this._collapse, this);
			}
			var link = this._layersLink = L.DomUtil.create('a', className + '-toggle', container);
			link.href = '#';
			link.title = 'Layers';

			if (L.Browser.touch) {
				L.DomEvent
				    .on(link, 'click', L.DomEvent.stop)
				    .on(link, 'click', this._expand, this);
			}
			else {
				L.DomEvent.on(link, 'focus', this._expand, this);
			}
			//Work around for Firefox android issue https://github.com/Leaflet/Leaflet/issues/2033
			L.DomEvent.on(form, 'click', function () {
				setTimeout(L.bind(this._onInputClick, this), 0);
			}, this);

			this._map.on('click', this._collapse, this);
			// TODO keyboard accessibility
		} else {
			this._expand();
		}

		this._baseLayersList = L.DomUtil.create('div', className + '-base', form);
		this._separator = L.DomUtil.create('div', className + '-separator', form);
		this._overlaysList = L.DomUtil.create('div', className + '-overlays', form);

		container.appendChild(form);
	},

	_addLayer: function (layer, name, overlay) {
		var id = L.stamp(layer);

		this._layers[id] = {
			layer: layer,
			name: name,
			overlay: overlay
		};

		if (this.options.autoZIndex && layer.setZIndex) {
			this._lastZIndex++;
			layer.setZIndex(this._lastZIndex);
		}
	},

	_update: function () {
		if (!this._container) {
			return;
		}

		this._baseLayersList.innerHTML = '';
		this._overlaysList.innerHTML = '';

		var baseLayersPresent = false,
		    overlaysPresent = false,
		    i, obj;

		for (i in this._layers) {
			obj = this._layers[i];
			this._addItem(obj);
			overlaysPresent = overlaysPresent || obj.overlay;
			baseLayersPresent = baseLayersPresent || !obj.overlay;
		}

		this._separator.style.display = overlaysPresent && baseLayersPresent ? '' : 'none';
	},

	_onLayerChange: function (e) {
		var obj = this._layers[L.stamp(e.layer)];

		if (!obj) { return; }

		if (!this._handlingClick) {
			this._update();
		}

		var type = obj.overlay ?
			(e.type === 'layeradd' ? 'overlayadd' : 'overlayremove') :
			(e.type === 'layeradd' ? 'baselayerchange' : null);

		if (type) {
			this._map.fire(type, obj);
		}
	},

	// IE7 bugs out if you create a radio dynamically, so you have to do it this hacky way (see http://bit.ly/PqYLBe)
	_createRadioElement: function (name, checked) {

		var radioHtml = '<input type="radio" class="leaflet-control-layers-selector" name="' + name + '"';
		if (checked) {
			radioHtml += ' checked="checked"';
		}
		radioHtml += '/>';

		var radioFragment = document.createElement('div');
		radioFragment.innerHTML = radioHtml;

		return radioFragment.firstChild;
	},

	_addItem: function (obj) {
		var label = document.createElement('label'),
		    input,
		    checked = this._map.hasLayer(obj.layer);

		if (obj.overlay) {
			input = document.createElement('input');
			input.type = 'checkbox';
			input.className = 'leaflet-control-layers-selector';
			input.defaultChecked = checked;
		} else {
			input = this._createRadioElement('leaflet-base-layers', checked);
		}

		input.layerId = L.stamp(obj.layer);

		L.DomEvent.on(input, 'click', this._onInputClick, this);

		var name = document.createElement('span');
		name.innerHTML = ' ' + obj.name;

		label.appendChild(input);
		label.appendChild(name);

		var container = obj.overlay ? this._overlaysList : this._baseLayersList;
		container.appendChild(label);

		return label;
	},

	_onInputClick: function () {
		var i, input, obj,
		    inputs = this._form.getElementsByTagName('input'),
		    inputsLen = inputs.length;

		this._handlingClick = true;

		for (i = 0; i < inputsLen; i++) {
			input = inputs[i];
			obj = this._layers[input.layerId];

			if (input.checked && !this._map.hasLayer(obj.layer)) {
				this._map.addLayer(obj.layer);

			} else if (!input.checked && this._map.hasLayer(obj.layer)) {
				this._map.removeLayer(obj.layer);
			}
		}

		this._handlingClick = false;

		this._refocusOnMap();
	},

	_expand: function () {
		L.DomUtil.addClass(this._container, 'leaflet-control-layers-expanded');
	},

	_collapse: function () {
		this._container.className = this._container.className.replace(' leaflet-control-layers-expanded', '');
	}
});

L.control.layers = function (baseLayers, overlays, options) {
	return new L.Control.Layers(baseLayers, overlays, options);
};


/*
 * L.PosAnimation is used by Leaflet internally for pan animations.
 */

L.PosAnimation = L.Class.extend({
	includes: L.Mixin.Events,

	run: function (el, newPos, duration, easeLinearity) { // (HTMLElement, Point[, Number, Number])
		this.stop();

		this._el = el;
		this._inProgress = true;
		this._newPos = newPos;

		this.fire('start');

		el.style[L.DomUtil.TRANSITION] = 'all ' + (duration || 0.25) +
		        's cubic-bezier(0,0,' + (easeLinearity || 0.5) + ',1)';

		L.DomEvent.on(el, L.DomUtil.TRANSITION_END, this._onTransitionEnd, this);
		L.DomUtil.setPosition(el, newPos);

		// toggle reflow, Chrome flickers for some reason if you don't do this
		L.Util.falseFn(el.offsetWidth);

		// there's no native way to track value updates of transitioned properties, so we imitate this
		this._stepTimer = setInterval(L.bind(this._onStep, this), 50);
	},

	stop: function () {
		if (!this._inProgress) { return; }

		// if we just removed the transition property, the element would jump to its final position,
		// so we need to make it stay at the current position

		L.DomUtil.setPosition(this._el, this._getPos());
		this._onTransitionEnd();
		L.Util.falseFn(this._el.offsetWidth); // force reflow in case we are about to start a new animation
	},

	_onStep: function () {
		var stepPos = this._getPos();
		if (!stepPos) {
			this._onTransitionEnd();
			return;
		}
		// jshint camelcase: false
		// make L.DomUtil.getPosition return intermediate position value during animation
		this._el._leaflet_pos = stepPos;

		this.fire('step');
	},

	// you can't easily get intermediate values of properties animated with CSS3 Transitions,
	// we need to parse computed style (in case of transform it returns matrix string)

	_transformRe: /([-+]?(?:\d*\.)?\d+)\D*, ([-+]?(?:\d*\.)?\d+)\D*\)/,

	_getPos: function () {
		var left, top, matches,
		    el = this._el,
		    style = window.getComputedStyle(el);

		if (L.Browser.any3d) {
			matches = style[L.DomUtil.TRANSFORM].match(this._transformRe);
			if (!matches) { return; }
			left = parseFloat(matches[1]);
			top  = parseFloat(matches[2]);
		} else {
			left = parseFloat(style.left);
			top  = parseFloat(style.top);
		}

		return new L.Point(left, top, true);
	},

	_onTransitionEnd: function () {
		L.DomEvent.off(this._el, L.DomUtil.TRANSITION_END, this._onTransitionEnd, this);

		if (!this._inProgress) { return; }
		this._inProgress = false;

		this._el.style[L.DomUtil.TRANSITION] = '';

		// jshint camelcase: false
		// make sure L.DomUtil.getPosition returns the final position value after animation
		this._el._leaflet_pos = this._newPos;

		clearInterval(this._stepTimer);

		this.fire('step').fire('end');
	}

});


/*
 * Extends L.Map to handle panning animations.
 */

L.Map.include({

	setView: function (center, zoom, options) {

		zoom = zoom === undefined ? this._zoom : this._limitZoom(zoom);
		center = this._limitCenter(L.latLng(center), zoom, this.options.maxBounds);
		options = options || {};

		if (this._panAnim) {
			this._panAnim.stop();
		}

		if (this._loaded && !options.reset && options !== true) {

			if (options.animate !== undefined) {
				options.zoom = L.extend({animate: options.animate}, options.zoom);
				options.pan = L.extend({animate: options.animate}, options.pan);
			}

			// try animating pan or zoom
			var animated = (this._zoom !== zoom) ?
				this._tryAnimatedZoom && this._tryAnimatedZoom(center, zoom, options.zoom) :
				this._tryAnimatedPan(center, options.pan);

			if (animated) {
				// prevent resize handler call, the view will refresh after animation anyway
				clearTimeout(this._sizeTimer);
				return this;
			}
		}

		// animation didn't start, just reset the map view
		this._resetView(center, zoom);

		return this;
	},

	panBy: function (offset, options) {
		offset = L.point(offset).round();
		options = options || {};

		if (!offset.x && !offset.y) {
			return this;
		}

		if (!this._panAnim) {
			this._panAnim = new L.PosAnimation();

			this._panAnim.on({
				'step': this._onPanTransitionStep,
				'end': this._onPanTransitionEnd
			}, this);
		}

		// don't fire movestart if animating inertia
		if (!options.noMoveStart) {
			this.fire('movestart');
		}

		// animate pan unless animate: false specified
		if (options.animate !== false) {
			L.DomUtil.addClass(this._mapPane, 'leaflet-pan-anim');

			var newPos = this._getMapPanePos().subtract(offset);
			this._panAnim.run(this._mapPane, newPos, options.duration || 0.25, options.easeLinearity);
		} else {
			this._rawPanBy(offset);
			this.fire('move').fire('moveend');
		}

		return this;
	},

	_onPanTransitionStep: function () {
		this.fire('move');
	},

	_onPanTransitionEnd: function () {
		L.DomUtil.removeClass(this._mapPane, 'leaflet-pan-anim');
		this.fire('moveend');
	},

	_tryAnimatedPan: function (center, options) {
		// difference between the new and current centers in pixels
		var offset = this._getCenterOffset(center)._floor();

		// don't animate too far unless animate: true specified in options
		if ((options && options.animate) !== true && !this.getSize().contains(offset)) { return false; }

		this.panBy(offset, options);

		return true;
	}
});


/*
 * L.PosAnimation fallback implementation that powers Leaflet pan animations
 * in browsers that don't support CSS3 Transitions.
 */

L.PosAnimation = L.DomUtil.TRANSITION ? L.PosAnimation : L.PosAnimation.extend({

	run: function (el, newPos, duration, easeLinearity) { // (HTMLElement, Point[, Number, Number])
		this.stop();

		this._el = el;
		this._inProgress = true;
		this._duration = duration || 0.25;
		this._easeOutPower = 1 / Math.max(easeLinearity || 0.5, 0.2);

		this._startPos = L.DomUtil.getPosition(el);
		this._offset = newPos.subtract(this._startPos);
		this._startTime = +new Date();

		this.fire('start');

		this._animate();
	},

	stop: function () {
		if (!this._inProgress) { return; }

		this._step();
		this._complete();
	},

	_animate: function () {
		// animation loop
		this._animId = L.Util.requestAnimFrame(this._animate, this);
		this._step();
	},

	_step: function () {
		var elapsed = (+new Date()) - this._startTime,
		    duration = this._duration * 1000;

		if (elapsed < duration) {
			this._runFrame(this._easeOut(elapsed / duration));
		} else {
			this._runFrame(1);
			this._complete();
		}
	},

	_runFrame: function (progress) {
		var pos = this._startPos.add(this._offset.multiplyBy(progress));
		L.DomUtil.setPosition(this._el, pos);

		this.fire('step');
	},

	_complete: function () {
		L.Util.cancelAnimFrame(this._animId);

		this._inProgress = false;
		this.fire('end');
	},

	_easeOut: function (t) {
		return 1 - Math.pow(1 - t, this._easeOutPower);
	}
});


/*
 * Extends L.Map to handle zoom animations.
 */

L.Map.mergeOptions({
	zoomAnimation: true,
	zoomAnimationThreshold: 4
});

if (L.DomUtil.TRANSITION) {

	L.Map.addInitHook(function () {
		// don't animate on browsers without hardware-accelerated transitions or old Android/Opera
		this._zoomAnimated = this.options.zoomAnimation && L.DomUtil.TRANSITION &&
				L.Browser.any3d && !L.Browser.android23 && !L.Browser.mobileOpera;

		// zoom transitions run with the same duration for all layers, so if one of transitionend events
		// happens after starting zoom animation (propagating to the map pane), we know that it ended globally
		if (this._zoomAnimated) {
			L.DomEvent.on(this._mapPane, L.DomUtil.TRANSITION_END, this._catchTransitionEnd, this);
		}
	});
}

L.Map.include(!L.DomUtil.TRANSITION ? {} : {

	_catchTransitionEnd: function (e) {
		if (this._animatingZoom && e.propertyName.indexOf('transform') >= 0) {
			this._onZoomTransitionEnd();
		}
	},

	_nothingToAnimate: function () {
		return !this._container.getElementsByClassName('leaflet-zoom-animated').length;
	},

	_tryAnimatedZoom: function (center, zoom, options) {

		if (this._animatingZoom) { return true; }

		options = options || {};

		// don't animate if disabled, not supported or zoom difference is too large
		if (!this._zoomAnimated || options.animate === false || this._nothingToAnimate() ||
		        Math.abs(zoom - this._zoom) > this.options.zoomAnimationThreshold) { return false; }

		// offset is the pixel coords of the zoom origin relative to the current center
		var scale = this.getZoomScale(zoom),
		    offset = this._getCenterOffset(center)._divideBy(1 - 1 / scale),
			origin = this._getCenterLayerPoint()._add(offset);

		// don't animate if the zoom origin isn't within one screen from the current center, unless forced
		if (options.animate !== true && !this.getSize().contains(offset)) { return false; }

		this
		    .fire('movestart')
		    .fire('zoomstart');

		this._animateZoom(center, zoom, origin, scale, null, true);

		return true;
	},

	_animateZoom: function (center, zoom, origin, scale, delta, backwards, forTouchZoom) {

		if (!forTouchZoom) {
			this._animatingZoom = true;
		}

		// put transform transition on all layers with leaflet-zoom-animated class
		L.DomUtil.addClass(this._mapPane, 'leaflet-zoom-anim');

		// remember what center/zoom to set after animation
		this._animateToCenter = center;
		this._animateToZoom = zoom;

		// disable any dragging during animation
		if (L.Draggable) {
			L.Draggable._disabled = true;
		}

		L.Util.requestAnimFrame(function () {
			this.fire('zoomanim', {
				center: center,
				zoom: zoom,
				origin: origin,
				scale: scale,
				delta: delta,
				backwards: backwards
			});
			// horrible hack to work around a Chrome bug https://github.com/Leaflet/Leaflet/issues/3689
			setTimeout(L.bind(this._onZoomTransitionEnd, this), 250);
		}, this);
	},

	_onZoomTransitionEnd: function () {
		if (!this._animatingZoom) { return; }

		this._animatingZoom = false;

		L.DomUtil.removeClass(this._mapPane, 'leaflet-zoom-anim');

		this._resetView(this._animateToCenter, this._animateToZoom, true, true);

		if (L.Draggable) {
			L.Draggable._disabled = false;
		}
	}
});


/*
	Zoom animation logic for L.TileLayer.
*/

L.TileLayer.include({
	_animateZoom: function (e) {
		if (!this._animating) {
			this._animating = true;
			this._prepareBgBuffer();
		}

		var bg = this._bgBuffer,
		    transform = L.DomUtil.TRANSFORM,
		    initialTransform = e.delta ? L.DomUtil.getTranslateString(e.delta) : bg.style[transform],
		    scaleStr = L.DomUtil.getScaleString(e.scale, e.origin);

		bg.style[transform] = e.backwards ?
				scaleStr + ' ' + initialTransform :
				initialTransform + ' ' + scaleStr;
	},

	_endZoomAnim: function () {
		var front = this._tileContainer,
		    bg = this._bgBuffer;

		front.style.visibility = '';
		front.parentNode.appendChild(front); // Bring to fore

		// force reflow
		L.Util.falseFn(bg.offsetWidth);

		var zoom = this._map.getZoom();
		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			this._clearBgBuffer();
		}

		this._animating = false;
	},

	_clearBgBuffer: function () {
		var map = this._map;

		if (map && !map._animatingZoom && !map.touchZoom._zooming) {
			this._bgBuffer.innerHTML = '';
			this._bgBuffer.style[L.DomUtil.TRANSFORM] = '';
		}
	},

	_prepareBgBuffer: function () {

		var front = this._tileContainer,
		    bg = this._bgBuffer;

		// if foreground layer doesn't have many tiles but bg layer does,
		// keep the existing bg layer and just zoom it some more

		var bgLoaded = this._getLoadedTilesPercentage(bg),
		    frontLoaded = this._getLoadedTilesPercentage(front);

		if (bg && bgLoaded > 0.5 && frontLoaded < 0.5) {

			front.style.visibility = 'hidden';
			this._stopLoadingImages(front);
			return;
		}

		// prepare the buffer to become the front tile pane
		bg.style.visibility = 'hidden';
		bg.style[L.DomUtil.TRANSFORM] = '';

		// switch out the current layer to be the new bg layer (and vice-versa)
		this._tileContainer = bg;
		bg = this._bgBuffer = front;

		this._stopLoadingImages(bg);

		//prevent bg buffer from clearing right after zoom
		clearTimeout(this._clearBgBufferTimer);
	},

	_getLoadedTilesPercentage: function (container) {
		var tiles = container.getElementsByTagName('img'),
		    i, len, count = 0;

		for (i = 0, len = tiles.length; i < len; i++) {
			if (tiles[i].complete) {
				count++;
			}
		}
		return count / len;
	},

	// stops loading all tiles in the background layer
	_stopLoadingImages: function (container) {
		var tiles = Array.prototype.slice.call(container.getElementsByTagName('img')),
		    i, len, tile;

		for (i = 0, len = tiles.length; i < len; i++) {
			tile = tiles[i];

			if (!tile.complete) {
				tile.onload = L.Util.falseFn;
				tile.onerror = L.Util.falseFn;
				tile.src = L.Util.emptyImageUrl;

				tile.parentNode.removeChild(tile);
			}
		}
	}
});


/*
 * Provides L.Map with convenient shortcuts for using browser geolocation features.
 */

L.Map.include({
	_defaultLocateOptions: {
		watch: false,
		setView: false,
		maxZoom: Infinity,
		timeout: 10000,
		maximumAge: 0,
		enableHighAccuracy: false
	},

	locate: function (/*Object*/ options) {

		options = this._locateOptions = L.extend(this._defaultLocateOptions, options);

		if (!navigator.geolocation) {
			this._handleGeolocationError({
				code: 0,
				message: 'Geolocation not supported.'
			});
			return this;
		}

		var onResponse = L.bind(this._handleGeolocationResponse, this),
			onError = L.bind(this._handleGeolocationError, this);

		if (options.watch) {
			this._locationWatchId =
			        navigator.geolocation.watchPosition(onResponse, onError, options);
		} else {
			navigator.geolocation.getCurrentPosition(onResponse, onError, options);
		}
		return this;
	},

	stopLocate: function () {
		if (navigator.geolocation) {
			navigator.geolocation.clearWatch(this._locationWatchId);
		}
		if (this._locateOptions) {
			this._locateOptions.setView = false;
		}
		return this;
	},

	_handleGeolocationError: function (error) {
		var c = error.code,
		    message = error.message ||
		            (c === 1 ? 'permission denied' :
		            (c === 2 ? 'position unavailable' : 'timeout'));

		if (this._locateOptions.setView && !this._loaded) {
			this.fitWorld();
		}

		this.fire('locationerror', {
			code: c,
			message: 'Geolocation error: ' + message + '.'
		});
	},

	_handleGeolocationResponse: function (pos) {
		var lat = pos.coords.latitude,
		    lng = pos.coords.longitude,
		    latlng = new L.LatLng(lat, lng),

		    latAccuracy = 180 * pos.coords.accuracy / 40075017,
		    lngAccuracy = latAccuracy / Math.cos(L.LatLng.DEG_TO_RAD * lat),

		    bounds = L.latLngBounds(
		            [lat - latAccuracy, lng - lngAccuracy],
		            [lat + latAccuracy, lng + lngAccuracy]),

		    options = this._locateOptions;

		if (options.setView) {
			var zoom = Math.min(this.getBoundsZoom(bounds), options.maxZoom);
			this.setView(latlng, zoom);
		}

		var data = {
			latlng: latlng,
			bounds: bounds,
			timestamp: pos.timestamp
		};

		for (var i in pos.coords) {
			if (typeof pos.coords[i] === 'number') {
				data[i] = pos.coords[i];
			}
		}

		this.fire('locationfound', data);
	}
});


}(window, document));
},{}],4:[function(require,module,exports){
'use strict';

var L = require('leaflet');
require('leaflet-draw');
require('../lib/L.ImageTransform');

var cartourl = '//{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
var osmurl = '//{s}.tile.osm.org/{z}/{x}/{y}.png';
var stamenurl = '//{s}.tile.stamen.com/toner/{z}/{x}/{y}.png';

var osm = new L.TileLayer(stamenurl, {
  maxZoom: 18
});

var map = new L.Map('map', {
  layers: [osm],
  center: new L.LatLng(55.75, 37.63),
  zoom: 9
});

var imageLoader = document.querySelector('.upload');
L.DomEvent.on(imageLoader, 'change', function (e) {
  var reader = new FileReader();
  reader.onload = function (event) {
    var image = new Image();
    image.src = event.target.result;

    console.log(image.width, image.height);
    init(event.target.result, image.width, image.height);
  };
  reader.readAsDataURL(e.target.files[0]);
});

var dropbox = document.querySelector('.drop');
L.DomEvent.on(dropbox, "dragenter", L.DomEvent.stop).on(dropbox, "dragover", L.DomEvent.stop).on(dropbox, "drop", function (e) {
  L.DomEvent.stop(e);
  imageLoader.files = e.dataTransfer.files;
});

function getBounds(center, w, h) {
  var c = map.latLngToLayerPoint(center);

  var nw = map.layerPointToLatLng(c.subtract([w / 2, h / 2]));
  var se = map.layerPointToLatLng(c.add([w / 2, h / 2]));

  return [[nw.lat, nw.lng], [nw.lat, se.lng], [se.lat, se.lng], [se.lat, nw.lng]];
}

function init(src, w, h) {
  var _this = this;

  var anchors = getBounds(map.getCenter(), w, h);
  var clipCoords = getBounds(map.getCenter(), w, h);
  var image = L.imageTransform(src, anchors, {
    opacity: 0.5,
    clip: clipCoords,
    disableSetClip: false
  }).addTo(map);

  var externalPolygon = L.polygon(anchors, {
    fill: false
  }).addTo(map);

  var clipPolygon = L.polygon(clipCoords, {
    fill: false,
    color: 'red'
  }).addTo(map);

  if (!image.options.disableSetClip) {
    clipPolygon.editing.enable();

    clipPolygon.on('edit', function () {
      image.setClip(clipPolygon.getLatLngs());
    });
  }

  L.DomEvent.on(document.querySelector('.opacity'), 'input', function (e) {
    image.options.opacity = _this.value;
    image._updateOpacity();
  });

  function updateAnchors() {
    var anchors = anchorMarkers.map(function (marker) {
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

  var anchorMarkers = anchors.map(function (anchor) {
    return L.marker(anchor, {
      draggable: true
    }).addTo(map).on('drag', updateAnchors);
  });
}

},{"../lib/L.ImageTransform":1,"leaflet":3,"leaflet-draw":2}]},{},[4])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdzhyL1Byb2plY3RzL3dhcnBlci9saWIvTC5JbWFnZVRyYW5zZm9ybS5qcyIsIm5vZGVfbW9kdWxlcy9sZWFmbGV0LWRyYXcvZGlzdC9sZWFmbGV0LmRyYXcuanMiLCJub2RlX21vZHVsZXMvbGVhZmxldC9kaXN0L2xlYWZsZXQtc3JjLmpzIiwiL1VzZXJzL3c4ci9Qcm9qZWN0cy93YXJwZXIvc3JjL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7QUNBQSxDQUFDLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDO0FBQ3ZDLFlBQVUsRUFBRSxvQkFBUyxHQUFHLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTs7QUFDMUMsS0FBQyxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN0RSxRQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0dBQzFCOztBQUVELFlBQVUsRUFBRSxvQkFBUyxPQUFPLEVBQUU7QUFDNUIsUUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7QUFDbkIsUUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3ZDLFNBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDbEQsVUFBSSxFQUFFLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BCLFVBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztLQUNsQzs7QUFFRCxRQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7QUFDYixVQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDZjtHQUNGOztBQUVELHFCQUFtQixFQUFFLDZCQUFTLE1BQU0sRUFBRTtBQUNwQyxXQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7R0FDeEU7O0FBRUQsU0FBTyxFQUFFLGlCQUFTLFdBQVcsRUFBRTtBQUM3QixRQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNqRSxlQUFlLEdBQUcsRUFBRSxDQUFDOztBQUV2QixRQUFJLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxXQUFXLENBQUM7O0FBRWhDLFNBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQzNDLFVBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7VUFDdEQsS0FBSyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsU0FBUyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxFQUNwRixTQUFTLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3QixxQkFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ25EOztBQUVELFFBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLENBQUM7R0FDckM7O0FBRUQsZUFBYSxFQUFFLHVCQUFTLGVBQWUsRUFBRTtBQUN2QyxRQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztBQUN2QixRQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDO0FBQ3hDLFFBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztHQUNwQjs7QUFFRCxRQUFNLEVBQUUsZ0JBQVMsR0FBRyxFQUFFO0FBQ3BCLFFBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDO0FBQ2hCLFFBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7R0FDL0I7O0FBRUQsU0FBTyxFQUFFLG1CQUFXO0FBQ2xCLFdBQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7R0FDMUI7O0FBRUQsWUFBVSxFQUFFLEtBQUs7QUFDakIsWUFBVSxFQUFFLHNCQUFXO0FBQ3JCLFFBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLHFCQUFxQixDQUFDLENBQUM7O0FBRTdELFFBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFO0FBQ3RELE9BQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztLQUMxRCxNQUFNO0FBQ0wsT0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0tBQ3REOztBQUVELFFBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDeEMsUUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRTtBQUNyQixVQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0FBQ3RFLFVBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN0QyxVQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQ3ZELFVBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO0tBQ3hCLE1BQU07QUFDTCxVQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDdkMsVUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEtBQUssQ0FBQzs7O0FBR3hELFVBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7S0FDdEM7O0FBRUQsUUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDOzs7QUFHdEIsUUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDeEIsS0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ3RCLGdCQUFVLEVBQUUsSUFBSTtBQUNoQixtQkFBYSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTztBQUM3QixpQkFBVyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTztBQUMzQixZQUFNLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQztBQUN2QyxhQUFPLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQztBQUN6QyxTQUFHLEVBQUUsSUFBSSxDQUFDLElBQUk7S0FDZixDQUFDLENBQUM7R0FDSjs7QUFFRCxlQUFhLEVBQUUseUJBQVc7QUFDeEIsUUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztHQUNwQjs7QUFFRCxjQUFZLEVBQUUsd0JBQVc7QUFDdkIsUUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRTtBQUNyQixVQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztBQUN6QyxVQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztLQUM1QyxNQUFNOztBQUVMLFVBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7S0FDekM7QUFDRCxRQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQzs7QUFFdkIsUUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQ2QsUUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztHQUNuQjs7QUFFRCxRQUFNLEVBQUUsa0JBQVc7QUFDakIsUUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUU7QUFDekMsYUFBTztLQUNSO0FBQ0QsUUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU07UUFDbkIsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVE7UUFDMUQsT0FBTyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQy9ELElBQUksR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7UUFDL0UsT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRO1FBQ3ZCLENBQUMsR0FBRyxPQUFPLENBQUMsS0FBSztRQUNqQixDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU07UUFDbEIsTUFBTSxHQUFHLEVBQUU7UUFDWCxDQUFDO1FBQUUsR0FBRztRQUFFLENBQUMsQ0FBQzs7QUFFWixTQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUM5QyxPQUFDLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLFlBQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN4RDs7QUFFRCxLQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7O0FBRXBDLE9BQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQ2hDLE9BQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDOztBQUVqQyxRQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUN4RSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDOUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQzlCLENBQUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUM5QixDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDL0IsQ0FBQzs7O0FBR0YsUUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUNoQixhQUFPO0tBQ1I7OztBQUdELFNBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQ3hCLGNBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ3pDOztBQUVELFFBQUksQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7O0FBRTlELFdBQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUMxRSxRQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFO0FBQ3JCLFVBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFO0FBQ3pCLFlBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUN2QixhQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDakQsY0FBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUNqRixJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUIsY0FBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsRUFDbEYsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDL0I7O0FBRUQsWUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO09BQ3BCLE1BQU07QUFDTCxZQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7T0FDakM7S0FDRjtHQUNGOztBQUVELGlCQUFlLEVBQUUseUJBQVMsR0FBRyxFQUFFOztBQUM3QixRQUFJLEdBQUcsR0FBRyxXQUFXLENBQUM7QUFDdEIsT0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDaEYsT0FBRyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3RGLE9BQUcsSUFBSSxhQUFhLENBQUM7QUFDckIsT0FBRyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztBQUM3RixXQUFPLEdBQUcsQ0FBQztHQUNaOztBQUVELFdBQVMsRUFBRSxLQUFLO0FBQ2hCLGFBQVcsRUFBRSx1QkFBVztBQUN0QixRQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ3BDLFVBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPO1VBQ3ZCLEdBQUcsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDOztBQUVoQyxTQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDakQsU0FBRyxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7O0FBRTlELFNBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUNoQixXQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ2hFLFlBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNuQyxXQUFHLENBQUMsQ0FBQyxHQUFHLFFBQVEsR0FBRyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztPQUM1QztBQUNELFNBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUNoQixTQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDWCxTQUFHLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztBQUNyQixVQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFO0FBQy9CLFlBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO09BQ3RCO0FBQ0QsVUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7S0FDdkI7R0FDRjtDQUNGLENBQUMsQ0FBQzs7QUFFSCxDQUFDLENBQUMsY0FBYyxHQUFHLFVBQVMsR0FBRyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUU7QUFDaEQsU0FBTyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztDQUNuRCxDQUFDOztBQUVGLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQzdDLENBQUMsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsa0JBQWtCLEVBQUUsb0JBQW9CLEVBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFDOzs7QUFHL0csQ0FBQyxZQUFXO0FBQ1YsV0FBUyxHQUFHLENBQUMsQ0FBQyxFQUFFOztBQUNkLFdBQU8sQ0FDTCxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDL0UsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQy9FLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUNoRixDQUFDO0dBQ0g7O0FBRUQsV0FBUyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRTs7QUFDcEIsUUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pCLFNBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDNUIsV0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtBQUM1QixZQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDWixhQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQzVCLGFBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztTQUNwQztBQUNELFNBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztPQUNwQjtLQUNGO0FBQ0QsV0FBTyxDQUFDLENBQUM7R0FDVjs7QUFFRCxXQUFTLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFOztBQUNwQixXQUFPLENBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ3ZDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUN2QyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDeEMsQ0FBQztHQUNIOztBQUVELFdBQVMsYUFBYSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7QUFDckQsUUFBSSxDQUFDLEdBQUcsQ0FDTixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFDVixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FDUixDQUFDO0FBQ0YsUUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQyxXQUFPLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FDZixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFDVixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFDVixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDWCxDQUFDLENBQUM7R0FDSjs7QUFFRCxHQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssR0FBRztBQUN2Qix1QkFBbUIsRUFBRSw2QkFDbkIsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUNsQixHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQ2xCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFDbEIsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUNsQjtBQUNBLFVBQUksQ0FBQyxHQUFHLGFBQWEsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDOUQsVUFBSSxDQUFDLEdBQUcsYUFBYSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUM5RCxhQUFPLE1BQU0sQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDMUI7O0FBRUQsV0FBTyxFQUFFLGlCQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO0FBQ3pCLFVBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0IsYUFBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ25DO0FBQ0QsT0FBRyxFQUFFLEdBQUc7R0FDVCxDQUFDO0NBQ0gsQ0FBQSxFQUFHLENBQUM7OztBQ3BSTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzE4UkEsSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzNCLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUN4QixPQUFPLENBQUMseUJBQXlCLENBQUMsQ0FBQzs7QUFFbkMsSUFBTSxRQUFRLEdBQUcsdURBQXVELENBQUM7QUFDekUsSUFBTSxNQUFNLEdBQUcsb0NBQW9DLENBQUM7QUFDcEQsSUFBTSxTQUFTLEdBQUcsNkNBQTZDLENBQUM7O0FBRWhFLElBQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUU7QUFDckMsU0FBTyxFQUFFLEVBQUU7Q0FDWixDQUFDLENBQUM7O0FBRUgsSUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRTtBQUMzQixRQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUM7QUFDYixRQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUM7QUFDbEMsTUFBSSxFQUFFLENBQUM7Q0FDUixDQUFDLENBQUM7O0FBRUgsSUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUN0RCxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLFVBQUMsQ0FBQyxFQUFLO0FBQzFDLE1BQUksTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7QUFDOUIsUUFBTSxDQUFDLE1BQU0sR0FBRyxVQUFTLEtBQUssRUFBRTtBQUM5QixRQUFJLEtBQUssR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO0FBQ3hCLFNBQUssQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7O0FBRWhDLFdBQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDdkMsUUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0dBQ3RELENBQUE7QUFDRCxRQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDekMsQ0FBQyxDQUFDOztBQUVILElBQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDaEQsQ0FBQyxDQUFDLFFBQVEsQ0FDUCxFQUFFLENBQUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUN6QyxFQUFFLENBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUN4QyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxVQUFDLENBQUMsRUFBSztBQUMxQixHQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNuQixhQUFXLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO0NBQzFDLENBQUMsQ0FBQzs7QUFFTCxTQUFTLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRTtBQUMvQixNQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7O0FBRXZDLE1BQUksRUFBRSxHQUFHLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzVELE1BQUksRUFBRSxHQUFHLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDOztBQUV2RCxTQUFPLENBQ0wsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFDaEIsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFDaEIsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFDaEIsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FDakIsQ0FBQztDQUNIOztBQUVELFNBQVMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFOzs7QUFDdkIsTUFBSSxPQUFPLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDL0MsTUFBSSxVQUFVLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEQsTUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFO0FBQ3pDLFdBQU8sRUFBRSxHQUFHO0FBQ1osUUFBSSxFQUFFLFVBQVU7QUFDaEIsa0JBQWMsRUFBRSxLQUFLO0dBQ3RCLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7O0FBR2QsTUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUU7QUFDdkMsUUFBSSxFQUFFLEtBQUs7R0FDWixDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDOztBQUVkLE1BQUksV0FBVyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFO0FBQ3RDLFFBQUksRUFBRSxLQUFLO0FBQ1gsU0FBSyxFQUFFLEtBQUs7R0FDYixDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDOztBQUVkLE1BQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRTtBQUNqQyxlQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDOztBQUU3QixlQUFXLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxZQUFXO0FBQ2hDLFdBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7S0FDekMsQ0FBQyxDQUFDO0dBQ0o7O0FBRUQsR0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsRUFBRSxPQUFPLEVBQUUsVUFBQyxDQUFDLEVBQUs7QUFDaEUsU0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsTUFBSyxLQUFLLENBQUM7QUFDbkMsU0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO0dBQ3hCLENBQUMsQ0FBQzs7QUFFSCxXQUFTLGFBQWEsR0FBRztBQUN2QixRQUFJLE9BQU8sR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDLFVBQUMsTUFBTSxFQUFLO0FBQzFDLFVBQUksRUFBRSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUM1QixhQUFPLEVBQUUsQ0FBQztLQUNYLENBQUMsQ0FBQztBQUNILFNBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDMUIsbUJBQWUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDcEMsZUFBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQzs7OztBQUl4QyxRQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUU7QUFDakMsaUJBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDOUIsaUJBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDOUI7R0FDRjs7QUFFRCxNQUFJLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQUMsTUFBTSxFQUFLO0FBQzFDLFdBQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUU7QUFDdEIsZUFBUyxFQUFFLElBQUk7S0FDaEIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0dBQ3pDLENBQUMsQ0FBQztDQUNKIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIkwuSW1hZ2VUcmFuc2Zvcm0gPSBMLkltYWdlT3ZlcmxheS5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbih1cmwsIGFuY2hvcnMsIG9wdGlvbnMpIHsgLy8gKFN0cmluZywgTGF0TG5nQm91bmRzLCBPYmplY3QpXG4gICAgTC5JbWFnZU92ZXJsYXkucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCB1cmwsIGFuY2hvcnMsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2V0QW5jaG9ycyhhbmNob3JzKTtcbiAgfSxcblxuICBzZXRBbmNob3JzOiBmdW5jdGlvbihhbmNob3JzKSB7XG4gICAgdGhpcy5fYW5jaG9ycyA9IFtdO1xuICAgIHRoaXMuX2JvdW5kcyA9IEwubGF0TG5nQm91bmRzKGFuY2hvcnMpO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBhbmNob3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICB2YXIgeXggPSBhbmNob3JzW2ldO1xuICAgICAgdGhpcy5fYW5jaG9ycy5wdXNoKEwubGF0TG5nKHl4KSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX21hcCkge1xuICAgICAgdGhpcy5fcmVzZXQoKTtcbiAgICB9XG4gIH0sXG5cbiAgX2xhdExuZ1RvTGF5ZXJQb2ludDogZnVuY3Rpb24obGF0bG5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX21hcC5wcm9qZWN0KGxhdGxuZykuX3N1YnRyYWN0KHRoaXMuX21hcC5nZXRQaXhlbE9yaWdpbigpKTtcbiAgfSxcblxuICBzZXRDbGlwOiBmdW5jdGlvbihjbGlwTGF0TG5ncykge1xuICAgIHZhciB0b3BMZWZ0ID0gdGhpcy5fbGF0TG5nVG9MYXllclBvaW50KHRoaXMuX2JvdW5kcy5nZXROb3J0aFdlc3QoKSksXG4gICAgICBwaXhlbENsaXBQb2ludHMgPSBbXTtcblxuICAgIHRoaXMub3B0aW9ucy5jbGlwID0gY2xpcExhdExuZ3M7XG5cbiAgICBmb3IgKHZhciBwID0gMDsgcCA8IGNsaXBMYXRMbmdzLmxlbmd0aDsgcCsrKSB7XG4gICAgICB2YXIgbWVyY1BvaW50ID0gdGhpcy5fbGF0TG5nVG9MYXllclBvaW50KGNsaXBMYXRMbmdzW3BdKSxcbiAgICAgICAgcGl4ZWwgPSBMLkltYWdlVHJhbnNmb3JtLlV0aWxzLnByb2plY3QodGhpcy5fbWF0cml4M2RfaW52ZXJzZSwgbWVyY1BvaW50LnggLSB0b3BMZWZ0LngsXG4gICAgICAgICAgbWVyY1BvaW50LnkgLSB0b3BMZWZ0LnkpO1xuICAgICAgcGl4ZWxDbGlwUG9pbnRzLnB1c2goTC5wb2ludChwaXhlbFswXSwgcGl4ZWxbMV0pKTtcbiAgICB9XG5cbiAgICB0aGlzLnNldENsaXBQaXhlbHMocGl4ZWxDbGlwUG9pbnRzKTtcbiAgfSxcblxuICBzZXRDbGlwUGl4ZWxzOiBmdW5jdGlvbihwaXhlbENsaXBQb2ludHMpIHtcbiAgICB0aGlzLl9jbGlwRG9uZSA9IGZhbHNlO1xuICAgIHRoaXMuX3BpeGVsQ2xpcFBvaW50cyA9IHBpeGVsQ2xpcFBvaW50cztcbiAgICB0aGlzLl9kcmF3Q2FudmFzKCk7XG4gIH0sXG5cbiAgc2V0VXJsOiBmdW5jdGlvbih1cmwpIHtcbiAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgdGhpcy5faW1nTm9kZS5zcmMgPSB0aGlzLl91cmw7XG4gIH0sXG5cbiAgZ2V0Q2xpcDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMub3B0aW9ucy5jbGlwO1xuICB9LFxuXG4gIF9pbWdMb2FkZWQ6IGZhbHNlLFxuICBfaW5pdEltYWdlOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl9pbWFnZSA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsICdsZWFmbGV0LWltYWdlLWxheWVyJyk7XG5cbiAgICBpZiAodGhpcy5fbWFwLm9wdGlvbnMuem9vbUFuaW1hdGlvbiAmJiBMLkJyb3dzZXIuYW55M2QpIHtcbiAgICAgIEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9pbWFnZSwgJ2xlYWZsZXQtem9vbS1hbmltYXRlZCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5faW1hZ2UsICdsZWFmbGV0LXpvb20taGlkZScpO1xuICAgIH1cblxuICAgIHRoaXMuX2ltZ05vZGUgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbWcnKTtcbiAgICBpZiAodGhpcy5vcHRpb25zLmNsaXApIHtcbiAgICAgIHRoaXMuX2NhbnZhcyA9IEwuRG9tVXRpbC5jcmVhdGUoJ2NhbnZhcycsICdsZWFmbGV0LWNhbnZhcy10cmFuc2Zvcm0nKTtcbiAgICAgIHRoaXMuX2ltYWdlLmFwcGVuZENoaWxkKHRoaXMuX2NhbnZhcyk7XG4gICAgICB0aGlzLl9jYW52YXMuc3R5bGVbTC5Eb21VdGlsLlRSQU5TRk9STV9PUklHSU5dID0gJzAgMCc7XG4gICAgICB0aGlzLl9jbGlwRG9uZSA9IGZhbHNlO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9pbWFnZS5hcHBlbmRDaGlsZCh0aGlzLl9pbWdOb2RlKTtcbiAgICAgIHRoaXMuX2ltZ05vZGUuc3R5bGVbTC5Eb21VdGlsLlRSQU5TRk9STV9PUklHSU5dID0gJzAgMCc7XG5cbiAgICAgIC8vIEhpZGUgaW1nTm9kZSB1bnRpbCBpbWFnZSBoYXMgbG9hZGVkXG4gICAgICB0aGlzLl9pbWdOb2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgfVxuXG4gICAgdGhpcy5fdXBkYXRlT3BhY2l0eSgpO1xuXG4gICAgLy9UT0RPIGNyZWF0ZUltYWdlIHV0aWwgbWV0aG9kIHRvIHJlbW92ZSBkdXBsaWNhdGlvblxuICAgIHRoaXMuX2ltZ0xvYWRlZCA9IGZhbHNlO1xuICAgIEwuZXh0ZW5kKHRoaXMuX2ltZ05vZGUsIHtcbiAgICAgIGdhbGxlcnlpbWc6ICdubycsXG4gICAgICBvbnNlbGVjdHN0YXJ0OiBMLlV0aWwuZmFsc2VGbixcbiAgICAgIG9ubW91c2Vtb3ZlOiBMLlV0aWwuZmFsc2VGbixcbiAgICAgIG9ubG9hZDogTC5iaW5kKHRoaXMuX29uSW1hZ2VMb2FkLCB0aGlzKSxcbiAgICAgIG9uZXJyb3I6IEwuYmluZCh0aGlzLl9vbkltYWdlRXJyb3IsIHRoaXMpLFxuICAgICAgc3JjOiB0aGlzLl91cmxcbiAgICB9KTtcbiAgfSxcblxuICBfb25JbWFnZUVycm9yOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmZpcmUoJ2Vycm9yJyk7XG4gIH0sXG5cbiAgX29uSW1hZ2VMb2FkOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5vcHRpb25zLmNsaXApIHtcbiAgICAgIHRoaXMuX2NhbnZhcy53aWR0aCA9IHRoaXMuX2ltZ05vZGUud2lkdGg7XG4gICAgICB0aGlzLl9jYW52YXMuaGVpZ2h0ID0gdGhpcy5faW1nTm9kZS5oZWlnaHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFNob3cgaW1nTm9kZSBvbmNlIGltYWdlIGhhcyBsb2FkZWRcbiAgICAgIHRoaXMuX2ltZ05vZGUuc3R5bGUuZGlzcGxheSA9ICdpbmhlcml0JztcbiAgICB9XG4gICAgdGhpcy5faW1nTG9hZGVkID0gdHJ1ZTtcblxuICAgIHRoaXMuX3Jlc2V0KCk7XG4gICAgdGhpcy5maXJlKCdsb2FkJyk7XG4gIH0sXG5cbiAgX3Jlc2V0OiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5vcHRpb25zLmNsaXAgJiYgIXRoaXMuX2ltZ0xvYWRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgZGl2ID0gdGhpcy5faW1hZ2UsXG4gICAgICBpbWdOb2RlID0gdGhpcy5vcHRpb25zLmNsaXAgPyB0aGlzLl9jYW52YXMgOiB0aGlzLl9pbWdOb2RlLFxuICAgICAgdG9wTGVmdCA9IHRoaXMuX2xhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9ib3VuZHMuZ2V0Tm9ydGhXZXN0KCkpLFxuICAgICAgc2l6ZSA9IHRoaXMuX2xhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9ib3VuZHMuZ2V0U291dGhFYXN0KCkpLl9zdWJ0cmFjdCh0b3BMZWZ0KSxcbiAgICAgIGFuY2hvcnMgPSB0aGlzLl9hbmNob3JzLFxuICAgICAgdyA9IGltZ05vZGUud2lkdGgsXG4gICAgICBoID0gaW1nTm9kZS5oZWlnaHQsXG4gICAgICBwaXhlbHMgPSBbXSxcbiAgICAgIGksIGxlbiwgcDtcblxuICAgIGZvciAoaSA9IDAsIGxlbiA9IGFuY2hvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHAgPSB0aGlzLl9sYXRMbmdUb0xheWVyUG9pbnQoYW5jaG9yc1tpXSk7XG4gICAgICBwaXhlbHMucHVzaChMLnBvaW50KHAueCAtIHRvcExlZnQueCwgcC55IC0gdG9wTGVmdC55KSk7XG4gICAgfVxuXG4gICAgTC5Eb21VdGlsLnNldFBvc2l0aW9uKGRpdiwgdG9wTGVmdCk7XG5cbiAgICBkaXYuc3R5bGUud2lkdGggPSBzaXplLnggKyAncHgnO1xuICAgIGRpdi5zdHlsZS5oZWlnaHQgPSBzaXplLnkgKyAncHgnO1xuXG4gICAgdmFyIG1hdHJpeDNkID0gdGhpcy5fbWF0cml4M2QgPSBMLkltYWdlVHJhbnNmb3JtLlV0aWxzLmdlbmVyYWwyRFByb2plY3Rpb24oXG4gICAgICAwLCAwLCBwaXhlbHNbMF0ueCwgcGl4ZWxzWzBdLnksXG4gICAgICB3LCAwLCBwaXhlbHNbMV0ueCwgcGl4ZWxzWzFdLnksXG4gICAgICB3LCBoLCBwaXhlbHNbMl0ueCwgcGl4ZWxzWzJdLnksXG4gICAgICAwLCBoLCBwaXhlbHNbM10ueCwgcGl4ZWxzWzNdLnlcbiAgICApO1xuXG4gICAgLy9zb21ldGhpbmcgd2VudCB3cm9uZyAoZm9yIGV4YW1wbGUsIHRhcmdldCBpbWFnZSBzaXplIGlzIGxlc3MgdGhlbiBvbmUgcGl4ZWwpXG4gICAgaWYgKCFtYXRyaXgzZFs4XSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vbWF0cml4IG5vcm1hbGl6YXRpb25cbiAgICBmb3IgKGkgPSAwOyBpICE9PSA5OyArK2kpIHtcbiAgICAgIG1hdHJpeDNkW2ldID0gbWF0cml4M2RbaV0gLyBtYXRyaXgzZFs4XTtcbiAgICB9XG5cbiAgICB0aGlzLl9tYXRyaXgzZF9pbnZlcnNlID0gTC5JbWFnZVRyYW5zZm9ybS5VdGlscy5hZGoobWF0cml4M2QpO1xuXG4gICAgaW1nTm9kZS5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9IHRoaXMuX2dldE1hdHJpeDNkQ1NTKHRoaXMuX21hdHJpeDNkKTtcbiAgICBpZiAodGhpcy5vcHRpb25zLmNsaXApIHtcbiAgICAgIGlmICh0aGlzLl9waXhlbENsaXBQb2ludHMpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLmNsaXAgPSBbXTtcbiAgICAgICAgZm9yIChwID0gMDsgcCA8IHRoaXMuX3BpeGVsQ2xpcFBvaW50cy5sZW5ndGg7IHArKykge1xuICAgICAgICAgIHZhciBtZXJjUG9pbnQgPSBMLkltYWdlVHJhbnNmb3JtLlV0aWxzLnByb2plY3QobWF0cml4M2QsIHRoaXMuX3BpeGVsQ2xpcFBvaW50c1twXS54LFxuICAgICAgICAgICAgdGhpcy5fcGl4ZWxDbGlwUG9pbnRzW3BdLnkpO1xuICAgICAgICAgIHRoaXMub3B0aW9ucy5jbGlwLnB1c2godGhpcy5fbWFwLmxheWVyUG9pbnRUb0xhdExuZyhMLnBvaW50KG1lcmNQb2ludFswXSArIHRvcExlZnQueCxcbiAgICAgICAgICAgIG1lcmNQb2ludFsxXSArIHRvcExlZnQueSkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2RyYXdDYW52YXMoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2V0Q2xpcCh0aGlzLm9wdGlvbnMuY2xpcCk7XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIF9nZXRNYXRyaXgzZENTUzogZnVuY3Rpb24oYXJyKSB7IC8vIGdldCBDU1MgYXRyaWJ1dGUgbWF0cml4M2RcbiAgICB2YXIgY3NzID0gJ21hdHJpeDNkKCc7XG4gICAgY3NzICs9IGFyclswXS50b0ZpeGVkKDkpICsgJywnICsgYXJyWzNdLnRvRml4ZWQoOSkgKyAnLCAwLCcgKyBhcnJbNl0udG9GaXhlZCg5KTtcbiAgICBjc3MgKz0gJywnICsgYXJyWzFdLnRvRml4ZWQoOSkgKyAnLCcgKyBhcnJbNF0udG9GaXhlZCg5KSArICcsIDAsJyArIGFycls3XS50b0ZpeGVkKDkpO1xuICAgIGNzcyArPSAnLDAsIDAsIDEsIDAnO1xuICAgIGNzcyArPSAnLCcgKyBhcnJbMl0udG9GaXhlZCg5KSArICcsJyArIGFycls1XS50b0ZpeGVkKDkpICsgJywgMCwgJyArIGFycls4XS50b0ZpeGVkKDkpICsgJyknO1xuICAgIHJldHVybiBjc3M7XG4gIH0sXG5cbiAgX2NsaXBEb25lOiBmYWxzZSxcbiAgX2RyYXdDYW52YXM6IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5fY2xpcERvbmUgJiYgdGhpcy5faW1nTm9kZSkge1xuICAgICAgdmFyIGNhbnZhcyA9IHRoaXMuX2NhbnZhcyxcbiAgICAgICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cbiAgICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBjdHguY3JlYXRlUGF0dGVybih0aGlzLl9pbWdOb2RlLCAnbm8tcmVwZWF0Jyk7XG5cbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLl9waXhlbENsaXBQb2ludHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgdmFyIHBpeCA9IHRoaXMuX3BpeGVsQ2xpcFBvaW50c1tpXTtcbiAgICAgICAgY3R4W2kgPyAnbGluZVRvJyA6ICdtb3ZlVG8nXShwaXgueCwgcGl4LnkpO1xuICAgICAgfVxuICAgICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgICAgY3R4LmZpbGwoKTtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBudWxsO1xuICAgICAgaWYgKHRoaXMub3B0aW9ucy5kaXNhYmxlU2V0Q2xpcCkge1xuICAgICAgICB0aGlzLl9pbWdOb2RlID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2NsaXBEb25lID0gdHJ1ZTtcbiAgICB9XG4gIH1cbn0pO1xuXG5MLmltYWdlVHJhbnNmb3JtID0gZnVuY3Rpb24odXJsLCBib3VuZHMsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIG5ldyBMLkltYWdlVHJhbnNmb3JtKHVybCwgYm91bmRzLCBvcHRpb25zKTtcbn07XG5cbkwuRG9tVXRpbC5UUkFOU0ZPUk1fT1JJR0lOID0gTC5Eb21VdGlsLnRlc3RQcm9wKFxuICBbJ3RyYW5zZm9ybU9yaWdpbicsICdXZWJraXRUcmFuc2Zvcm1PcmlnaW4nLCAnT1RyYW5zZm9ybU9yaWdpbicsICdNb3pUcmFuc2Zvcm1PcmlnaW4nLCAnbXNUcmFuc2Zvcm1PcmlnaW4nXSk7XG5cbi8vQmFzZWQgb24gaHR0cDovL21hdGguc3RhY2tleGNoYW5nZS5jb20vcXVlc3Rpb25zLzI5Njc5NC9maW5kaW5nLXRoZS10cmFuc2Zvcm0tbWF0cml4LWZyb20tNC1wcm9qZWN0ZWQtcG9pbnRzLXdpdGgtamF2YXNjcmlwdFxuKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBhZGoobSkgeyAvLyBDb21wdXRlIHRoZSBhZGp1Z2F0ZSBvZiBtXG4gICAgcmV0dXJuIFtcbiAgICAgIG1bNF0gKiBtWzhdIC0gbVs1XSAqIG1bN10sIG1bMl0gKiBtWzddIC0gbVsxXSAqIG1bOF0sIG1bMV0gKiBtWzVdIC0gbVsyXSAqIG1bNF0sXG4gICAgICBtWzVdICogbVs2XSAtIG1bM10gKiBtWzhdLCBtWzBdICogbVs4XSAtIG1bMl0gKiBtWzZdLCBtWzJdICogbVszXSAtIG1bMF0gKiBtWzVdLFxuICAgICAgbVszXSAqIG1bN10gLSBtWzRdICogbVs2XSwgbVsxXSAqIG1bNl0gLSBtWzBdICogbVs3XSwgbVswXSAqIG1bNF0gLSBtWzFdICogbVszXVxuICAgIF07XG4gIH1cblxuICBmdW5jdGlvbiBtdWx0bW0oYSwgYikgeyAvLyBtdWx0aXBseSB0d28gbWF0cmljZXNcbiAgICB2YXIgYyA9IEFycmF5KDkpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpICE9PSAzOyArK2kpIHtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqICE9PSAzOyArK2opIHtcbiAgICAgICAgdmFyIGNpaiA9IDA7XG4gICAgICAgIGZvciAodmFyIGsgPSAwOyBrICE9PSAzOyArK2spIHtcbiAgICAgICAgICBjaWogKz0gYVszICogaSArIGtdICogYlszICogayArIGpdO1xuICAgICAgICB9XG4gICAgICAgIGNbMyAqIGkgKyBqXSA9IGNpajtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGM7XG4gIH1cblxuICBmdW5jdGlvbiBtdWx0bXYobSwgdikgeyAvLyBtdWx0aXBseSBtYXRyaXggYW5kIHZlY3RvclxuICAgIHJldHVybiBbXG4gICAgICBtWzBdICogdlswXSArIG1bMV0gKiB2WzFdICsgbVsyXSAqIHZbMl0sXG4gICAgICBtWzNdICogdlswXSArIG1bNF0gKiB2WzFdICsgbVs1XSAqIHZbMl0sXG4gICAgICBtWzZdICogdlswXSArIG1bN10gKiB2WzFdICsgbVs4XSAqIHZbMl1cbiAgICBdO1xuICB9XG5cbiAgZnVuY3Rpb24gYmFzaXNUb1BvaW50cyh4MSwgeTEsIHgyLCB5MiwgeDMsIHkzLCB4NCwgeTQpIHtcbiAgICB2YXIgbSA9IFtcbiAgICAgIHgxLCB4MiwgeDMsXG4gICAgICB5MSwgeTIsIHkzLFxuICAgICAgMSwgMSwgMVxuICAgIF07XG4gICAgdmFyIHYgPSBtdWx0bXYoYWRqKG0pLCBbeDQsIHk0LCAxXSk7XG4gICAgcmV0dXJuIG11bHRtbShtLCBbXG4gICAgICB2WzBdLCAwLCAwLFxuICAgICAgMCwgdlsxXSwgMCxcbiAgICAgIDAsIDAsIHZbMl1cbiAgICBdKTtcbiAgfVxuXG4gIEwuSW1hZ2VUcmFuc2Zvcm0uVXRpbHMgPSB7XG4gICAgZ2VuZXJhbDJEUHJvamVjdGlvbjogZnVuY3Rpb24oXG4gICAgICB4MXMsIHkxcywgeDFkLCB5MWQsXG4gICAgICB4MnMsIHkycywgeDJkLCB5MmQsXG4gICAgICB4M3MsIHkzcywgeDNkLCB5M2QsXG4gICAgICB4NHMsIHk0cywgeDRkLCB5NGRcbiAgICApIHtcbiAgICAgIHZhciBzID0gYmFzaXNUb1BvaW50cyh4MXMsIHkxcywgeDJzLCB5MnMsIHgzcywgeTNzLCB4NHMsIHk0cyk7XG4gICAgICB2YXIgZCA9IGJhc2lzVG9Qb2ludHMoeDFkLCB5MWQsIHgyZCwgeTJkLCB4M2QsIHkzZCwgeDRkLCB5NGQpO1xuICAgICAgcmV0dXJuIG11bHRtbShkLCBhZGoocykpO1xuICAgIH0sXG5cbiAgICBwcm9qZWN0OiBmdW5jdGlvbihtLCB4LCB5KSB7XG4gICAgICB2YXIgdiA9IG11bHRtdihtLCBbeCwgeSwgMV0pO1xuICAgICAgcmV0dXJuIFt2WzBdIC8gdlsyXSwgdlsxXSAvIHZbMl1dO1xuICAgIH0sXG4gICAgYWRqOiBhZGpcbiAgfTtcbn0pKCk7XG4iLCIvKlxuXHRMZWFmbGV0LmRyYXcsIGEgcGx1Z2luIHRoYXQgYWRkcyBkcmF3aW5nIGFuZCBlZGl0aW5nIHRvb2xzIHRvIExlYWZsZXQgcG93ZXJlZCBtYXBzLlxuXHQoYykgMjAxMi0yMDEzLCBKYWNvYiBUb3llLCBTbWFydHJha1xuXG5cdGh0dHBzOi8vZ2l0aHViLmNvbS9MZWFmbGV0L0xlYWZsZXQuZHJhd1xuXHRodHRwOi8vbGVhZmxldGpzLmNvbVxuXHRodHRwczovL2dpdGh1Yi5jb20vamFjb2J0b3llXG4qL1xuIWZ1bmN0aW9uKHQsZSl7TC5kcmF3VmVyc2lvbj1cIjAuMi40LWRldlwiLEwuZHJhd0xvY2FsPXtkcmF3Ont0b29sYmFyOnthY3Rpb25zOnt0aXRsZTpcIkNhbmNlbCBkcmF3aW5nXCIsdGV4dDpcIkNhbmNlbFwifSx1bmRvOnt0aXRsZTpcIkRlbGV0ZSBsYXN0IHBvaW50IGRyYXduXCIsdGV4dDpcIkRlbGV0ZSBsYXN0IHBvaW50XCJ9LGJ1dHRvbnM6e3BvbHlsaW5lOlwiRHJhdyBhIHBvbHlsaW5lXCIscG9seWdvbjpcIkRyYXcgYSBwb2x5Z29uXCIscmVjdGFuZ2xlOlwiRHJhdyBhIHJlY3RhbmdsZVwiLGNpcmNsZTpcIkRyYXcgYSBjaXJjbGVcIixtYXJrZXI6XCJEcmF3IGEgbWFya2VyXCJ9fSxoYW5kbGVyczp7Y2lyY2xlOnt0b29sdGlwOntzdGFydDpcIkNsaWNrIGFuZCBkcmFnIHRvIGRyYXcgY2lyY2xlLlwifX0sbWFya2VyOnt0b29sdGlwOntzdGFydDpcIkNsaWNrIG1hcCB0byBwbGFjZSBtYXJrZXIuXCJ9fSxwb2x5Z29uOnt0b29sdGlwOntzdGFydDpcIkNsaWNrIHRvIHN0YXJ0IGRyYXdpbmcgc2hhcGUuXCIsY29udDpcIkNsaWNrIHRvIGNvbnRpbnVlIGRyYXdpbmcgc2hhcGUuXCIsZW5kOlwiQ2xpY2sgZmlyc3QgcG9pbnQgdG8gY2xvc2UgdGhpcyBzaGFwZS5cIn19LHBvbHlsaW5lOntlcnJvcjpcIjxzdHJvbmc+RXJyb3I6PC9zdHJvbmc+IHNoYXBlIGVkZ2VzIGNhbm5vdCBjcm9zcyFcIix0b29sdGlwOntzdGFydDpcIkNsaWNrIHRvIHN0YXJ0IGRyYXdpbmcgbGluZS5cIixjb250OlwiQ2xpY2sgdG8gY29udGludWUgZHJhd2luZyBsaW5lLlwiLGVuZDpcIkNsaWNrIGxhc3QgcG9pbnQgdG8gZmluaXNoIGxpbmUuXCJ9fSxyZWN0YW5nbGU6e3Rvb2x0aXA6e3N0YXJ0OlwiQ2xpY2sgYW5kIGRyYWcgdG8gZHJhdyByZWN0YW5nbGUuXCJ9fSxzaW1wbGVzaGFwZTp7dG9vbHRpcDp7ZW5kOlwiUmVsZWFzZSBtb3VzZSB0byBmaW5pc2ggZHJhd2luZy5cIn19fX0sZWRpdDp7dG9vbGJhcjp7YWN0aW9uczp7c2F2ZTp7dGl0bGU6XCJTYXZlIGNoYW5nZXMuXCIsdGV4dDpcIlNhdmVcIn0sY2FuY2VsOnt0aXRsZTpcIkNhbmNlbCBlZGl0aW5nLCBkaXNjYXJkcyBhbGwgY2hhbmdlcy5cIix0ZXh0OlwiQ2FuY2VsXCJ9fSxidXR0b25zOntlZGl0OlwiRWRpdCBsYXllcnMuXCIsZWRpdERpc2FibGVkOlwiTm8gbGF5ZXJzIHRvIGVkaXQuXCIscmVtb3ZlOlwiRGVsZXRlIGxheWVycy5cIixyZW1vdmVEaXNhYmxlZDpcIk5vIGxheWVycyB0byBkZWxldGUuXCJ9fSxoYW5kbGVyczp7ZWRpdDp7dG9vbHRpcDp7dGV4dDpcIkRyYWcgaGFuZGxlcywgb3IgbWFya2VyIHRvIGVkaXQgZmVhdHVyZS5cIixzdWJ0ZXh0OlwiQ2xpY2sgY2FuY2VsIHRvIHVuZG8gY2hhbmdlcy5cIn19LHJlbW92ZTp7dG9vbHRpcDp7dGV4dDpcIkNsaWNrIG9uIGEgZmVhdHVyZSB0byByZW1vdmVcIn19fX19LEwuRHJhdz17fSxMLkRyYXcuRmVhdHVyZT1MLkhhbmRsZXIuZXh0ZW5kKHtpbmNsdWRlczpMLk1peGluLkV2ZW50cyxpbml0aWFsaXplOmZ1bmN0aW9uKHQsZSl7dGhpcy5fbWFwPXQsdGhpcy5fY29udGFpbmVyPXQuX2NvbnRhaW5lcix0aGlzLl9vdmVybGF5UGFuZT10Ll9wYW5lcy5vdmVybGF5UGFuZSx0aGlzLl9wb3B1cFBhbmU9dC5fcGFuZXMucG9wdXBQYW5lLGUmJmUuc2hhcGVPcHRpb25zJiYoZS5zaGFwZU9wdGlvbnM9TC5VdGlsLmV4dGVuZCh7fSx0aGlzLm9wdGlvbnMuc2hhcGVPcHRpb25zLGUuc2hhcGVPcHRpb25zKSksTC5zZXRPcHRpb25zKHRoaXMsZSl9LGVuYWJsZTpmdW5jdGlvbigpe3RoaXMuX2VuYWJsZWR8fCh0aGlzLmZpcmUoXCJlbmFibGVkXCIse2hhbmRsZXI6dGhpcy50eXBlfSksdGhpcy5fbWFwLmZpcmUoXCJkcmF3OmRyYXdzdGFydFwiLHtsYXllclR5cGU6dGhpcy50eXBlfSksTC5IYW5kbGVyLnByb3RvdHlwZS5lbmFibGUuY2FsbCh0aGlzKSl9LGRpc2FibGU6ZnVuY3Rpb24oKXt0aGlzLl9lbmFibGVkJiYoTC5IYW5kbGVyLnByb3RvdHlwZS5kaXNhYmxlLmNhbGwodGhpcyksdGhpcy5fbWFwLmZpcmUoXCJkcmF3OmRyYXdzdG9wXCIse2xheWVyVHlwZTp0aGlzLnR5cGV9KSx0aGlzLmZpcmUoXCJkaXNhYmxlZFwiLHtoYW5kbGVyOnRoaXMudHlwZX0pKX0sYWRkSG9va3M6ZnVuY3Rpb24oKXt2YXIgdD10aGlzLl9tYXA7dCYmKEwuRG9tVXRpbC5kaXNhYmxlVGV4dFNlbGVjdGlvbigpLHQuZ2V0Q29udGFpbmVyKCkuZm9jdXMoKSx0aGlzLl90b29sdGlwPW5ldyBMLlRvb2x0aXAodGhpcy5fbWFwKSxMLkRvbUV2ZW50Lm9uKHRoaXMuX2NvbnRhaW5lcixcImtleXVwXCIsdGhpcy5fY2FuY2VsRHJhd2luZyx0aGlzKSl9LHJlbW92ZUhvb2tzOmZ1bmN0aW9uKCl7dGhpcy5fbWFwJiYoTC5Eb21VdGlsLmVuYWJsZVRleHRTZWxlY3Rpb24oKSx0aGlzLl90b29sdGlwLmRpc3Bvc2UoKSx0aGlzLl90b29sdGlwPW51bGwsTC5Eb21FdmVudC5vZmYodGhpcy5fY29udGFpbmVyLFwia2V5dXBcIix0aGlzLl9jYW5jZWxEcmF3aW5nLHRoaXMpKX0sc2V0T3B0aW9uczpmdW5jdGlvbih0KXtMLnNldE9wdGlvbnModGhpcyx0KX0sX2ZpcmVDcmVhdGVkRXZlbnQ6ZnVuY3Rpb24odCl7dGhpcy5fbWFwLmZpcmUoXCJkcmF3OmNyZWF0ZWRcIix7bGF5ZXI6dCxsYXllclR5cGU6dGhpcy50eXBlfSl9LF9jYW5jZWxEcmF3aW5nOmZ1bmN0aW9uKHQpezI3PT09dC5rZXlDb2RlJiZ0aGlzLmRpc2FibGUoKX19KSxMLkRyYXcuUG9seWxpbmU9TC5EcmF3LkZlYXR1cmUuZXh0ZW5kKHtzdGF0aWNzOntUWVBFOlwicG9seWxpbmVcIn0sUG9seTpMLlBvbHlsaW5lLG9wdGlvbnM6e2FsbG93SW50ZXJzZWN0aW9uOiEwLHJlcGVhdE1vZGU6ITEsZHJhd0Vycm9yOntjb2xvcjpcIiNiMDBiMDBcIix0aW1lb3V0OjI1MDB9LGljb246bmV3IEwuRGl2SWNvbih7aWNvblNpemU6bmV3IEwuUG9pbnQoOCw4KSxjbGFzc05hbWU6XCJsZWFmbGV0LWRpdi1pY29uIGxlYWZsZXQtZWRpdGluZy1pY29uXCJ9KSxndWlkZWxpbmVEaXN0YW5jZToyMCxtYXhHdWlkZUxpbmVMZW5ndGg6NGUzLHNoYXBlT3B0aW9uczp7c3Ryb2tlOiEwLGNvbG9yOlwiI2YwNmVhYVwiLHdlaWdodDo0LG9wYWNpdHk6LjUsZmlsbDohMSxjbGlja2FibGU6ITB9LG1ldHJpYzohMCxzaG93TGVuZ3RoOiEwLHpJbmRleE9mZnNldDoyZTN9LGluaXRpYWxpemU6ZnVuY3Rpb24odCxlKXt0aGlzLm9wdGlvbnMuZHJhd0Vycm9yLm1lc3NhZ2U9TC5kcmF3TG9jYWwuZHJhdy5oYW5kbGVycy5wb2x5bGluZS5lcnJvcixlJiZlLmRyYXdFcnJvciYmKGUuZHJhd0Vycm9yPUwuVXRpbC5leHRlbmQoe30sdGhpcy5vcHRpb25zLmRyYXdFcnJvcixlLmRyYXdFcnJvcikpLHRoaXMudHlwZT1MLkRyYXcuUG9seWxpbmUuVFlQRSxMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsdCxlKX0sYWRkSG9va3M6ZnVuY3Rpb24oKXtMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUuYWRkSG9va3MuY2FsbCh0aGlzKSx0aGlzLl9tYXAmJih0aGlzLl9tYXJrZXJzPVtdLHRoaXMuX21hcmtlckdyb3VwPW5ldyBMLkxheWVyR3JvdXAsdGhpcy5fbWFwLmFkZExheWVyKHRoaXMuX21hcmtlckdyb3VwKSx0aGlzLl9wb2x5PW5ldyBMLlBvbHlsaW5lKFtdLHRoaXMub3B0aW9ucy5zaGFwZU9wdGlvbnMpLHRoaXMuX3Rvb2x0aXAudXBkYXRlQ29udGVudCh0aGlzLl9nZXRUb29sdGlwVGV4dCgpKSx0aGlzLl9tb3VzZU1hcmtlcnx8KHRoaXMuX21vdXNlTWFya2VyPUwubWFya2VyKHRoaXMuX21hcC5nZXRDZW50ZXIoKSx7aWNvbjpMLmRpdkljb24oe2NsYXNzTmFtZTpcImxlYWZsZXQtbW91c2UtbWFya2VyXCIsaWNvbkFuY2hvcjpbMjAsMjBdLGljb25TaXplOls0MCw0MF19KSxvcGFjaXR5OjAsekluZGV4T2Zmc2V0OnRoaXMub3B0aW9ucy56SW5kZXhPZmZzZXR9KSksdGhpcy5fbW91c2VNYXJrZXIub24oXCJtb3VzZWRvd25cIix0aGlzLl9vbk1vdXNlRG93bix0aGlzKS5hZGRUbyh0aGlzLl9tYXApLHRoaXMuX21hcC5vbihcIm1vdXNlbW92ZVwiLHRoaXMuX29uTW91c2VNb3ZlLHRoaXMpLm9uKFwibW91c2V1cFwiLHRoaXMuX29uTW91c2VVcCx0aGlzKS5vbihcInpvb21lbmRcIix0aGlzLl9vblpvb21FbmQsdGhpcykpfSxyZW1vdmVIb29rczpmdW5jdGlvbigpe0wuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5yZW1vdmVIb29rcy5jYWxsKHRoaXMpLHRoaXMuX2NsZWFySGlkZUVycm9yVGltZW91dCgpLHRoaXMuX2NsZWFuVXBTaGFwZSgpLHRoaXMuX21hcC5yZW1vdmVMYXllcih0aGlzLl9tYXJrZXJHcm91cCksZGVsZXRlIHRoaXMuX21hcmtlckdyb3VwLGRlbGV0ZSB0aGlzLl9tYXJrZXJzLHRoaXMuX21hcC5yZW1vdmVMYXllcih0aGlzLl9wb2x5KSxkZWxldGUgdGhpcy5fcG9seSx0aGlzLl9tb3VzZU1hcmtlci5vZmYoXCJtb3VzZWRvd25cIix0aGlzLl9vbk1vdXNlRG93bix0aGlzKS5vZmYoXCJtb3VzZXVwXCIsdGhpcy5fb25Nb3VzZVVwLHRoaXMpLHRoaXMuX21hcC5yZW1vdmVMYXllcih0aGlzLl9tb3VzZU1hcmtlciksZGVsZXRlIHRoaXMuX21vdXNlTWFya2VyLHRoaXMuX2NsZWFyR3VpZGVzKCksdGhpcy5fbWFwLm9mZihcIm1vdXNlbW92ZVwiLHRoaXMuX29uTW91c2VNb3ZlLHRoaXMpLm9mZihcInpvb21lbmRcIix0aGlzLl9vblpvb21FbmQsdGhpcyl9LGRlbGV0ZUxhc3RWZXJ0ZXg6ZnVuY3Rpb24oKXtpZighKHRoaXMuX21hcmtlcnMubGVuZ3RoPD0xKSl7dmFyIHQ9dGhpcy5fbWFya2Vycy5wb3AoKSxlPXRoaXMuX3BvbHksaT10aGlzLl9wb2x5LnNwbGljZUxhdExuZ3MoZS5nZXRMYXRMbmdzKCkubGVuZ3RoLTEsMSlbMF07dGhpcy5fbWFya2VyR3JvdXAucmVtb3ZlTGF5ZXIodCksZS5nZXRMYXRMbmdzKCkubGVuZ3RoPDImJnRoaXMuX21hcC5yZW1vdmVMYXllcihlKSx0aGlzLl92ZXJ0ZXhDaGFuZ2VkKGksITEpfX0sYWRkVmVydGV4OmZ1bmN0aW9uKHQpe3ZhciBlPXRoaXMuX21hcmtlcnMubGVuZ3RoO3JldHVybiBlPjAmJiF0aGlzLm9wdGlvbnMuYWxsb3dJbnRlcnNlY3Rpb24mJnRoaXMuX3BvbHkubmV3TGF0TG5nSW50ZXJzZWN0cyh0KT8odGhpcy5fc2hvd0Vycm9yVG9vbHRpcCgpLHZvaWQgMCk6KHRoaXMuX2Vycm9yU2hvd24mJnRoaXMuX2hpZGVFcnJvclRvb2x0aXAoKSx0aGlzLl9tYXJrZXJzLnB1c2godGhpcy5fY3JlYXRlTWFya2VyKHQpKSx0aGlzLl9wb2x5LmFkZExhdExuZyh0KSwyPT09dGhpcy5fcG9seS5nZXRMYXRMbmdzKCkubGVuZ3RoJiZ0aGlzLl9tYXAuYWRkTGF5ZXIodGhpcy5fcG9seSksdGhpcy5fdmVydGV4Q2hhbmdlZCh0LCEwKSx2b2lkIDApfSxfZmluaXNoU2hhcGU6ZnVuY3Rpb24oKXt2YXIgdD10aGlzLl9wb2x5Lm5ld0xhdExuZ0ludGVyc2VjdHModGhpcy5fcG9seS5nZXRMYXRMbmdzKClbMF0sITApO3JldHVybiF0aGlzLm9wdGlvbnMuYWxsb3dJbnRlcnNlY3Rpb24mJnR8fCF0aGlzLl9zaGFwZUlzVmFsaWQoKT8odGhpcy5fc2hvd0Vycm9yVG9vbHRpcCgpLHZvaWQgMCk6KHRoaXMuX2ZpcmVDcmVhdGVkRXZlbnQoKSx0aGlzLmRpc2FibGUoKSx0aGlzLm9wdGlvbnMucmVwZWF0TW9kZSYmdGhpcy5lbmFibGUoKSx2b2lkIDApfSxfc2hhcGVJc1ZhbGlkOmZ1bmN0aW9uKCl7cmV0dXJuITB9LF9vblpvb21FbmQ6ZnVuY3Rpb24oKXt0aGlzLl91cGRhdGVHdWlkZSgpfSxfb25Nb3VzZU1vdmU6ZnVuY3Rpb24odCl7dmFyIGU9dC5sYXllclBvaW50LGk9dC5sYXRsbmc7dGhpcy5fY3VycmVudExhdExuZz1pLHRoaXMuX3VwZGF0ZVRvb2x0aXAoaSksdGhpcy5fdXBkYXRlR3VpZGUoZSksdGhpcy5fbW91c2VNYXJrZXIuc2V0TGF0TG5nKGkpLEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQodC5vcmlnaW5hbEV2ZW50KX0sX3ZlcnRleENoYW5nZWQ6ZnVuY3Rpb24odCxlKXt0aGlzLl91cGRhdGVGaW5pc2hIYW5kbGVyKCksdGhpcy5fdXBkYXRlUnVubmluZ01lYXN1cmUodCxlKSx0aGlzLl9jbGVhckd1aWRlcygpLHRoaXMuX3VwZGF0ZVRvb2x0aXAoKX0sX29uTW91c2VEb3duOmZ1bmN0aW9uKHQpe3ZhciBlPXQub3JpZ2luYWxFdmVudDt0aGlzLl9tb3VzZURvd25PcmlnaW49TC5wb2ludChlLmNsaWVudFgsZS5jbGllbnRZKX0sX29uTW91c2VVcDpmdW5jdGlvbihlKXtpZih0aGlzLl9tb3VzZURvd25PcmlnaW4pe3ZhciBpPUwucG9pbnQoZS5vcmlnaW5hbEV2ZW50LmNsaWVudFgsZS5vcmlnaW5hbEV2ZW50LmNsaWVudFkpLmRpc3RhbmNlVG8odGhpcy5fbW91c2VEb3duT3JpZ2luKTtNYXRoLmFicyhpKTw5Kih0LmRldmljZVBpeGVsUmF0aW98fDEpJiZ0aGlzLmFkZFZlcnRleChlLmxhdGxuZyl9dGhpcy5fbW91c2VEb3duT3JpZ2luPW51bGx9LF91cGRhdGVGaW5pc2hIYW5kbGVyOmZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5fbWFya2Vycy5sZW5ndGg7dD4xJiZ0aGlzLl9tYXJrZXJzW3QtMV0ub24oXCJjbGlja1wiLHRoaXMuX2ZpbmlzaFNoYXBlLHRoaXMpLHQ+MiYmdGhpcy5fbWFya2Vyc1t0LTJdLm9mZihcImNsaWNrXCIsdGhpcy5fZmluaXNoU2hhcGUsdGhpcyl9LF9jcmVhdGVNYXJrZXI6ZnVuY3Rpb24odCl7dmFyIGU9bmV3IEwuTWFya2VyKHQse2ljb246dGhpcy5vcHRpb25zLmljb24sekluZGV4T2Zmc2V0OjIqdGhpcy5vcHRpb25zLnpJbmRleE9mZnNldH0pO3JldHVybiB0aGlzLl9tYXJrZXJHcm91cC5hZGRMYXllcihlKSxlfSxfdXBkYXRlR3VpZGU6ZnVuY3Rpb24odCl7dmFyIGU9dGhpcy5fbWFya2Vycy5sZW5ndGg7ZT4wJiYodD10fHx0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KHRoaXMuX2N1cnJlbnRMYXRMbmcpLHRoaXMuX2NsZWFyR3VpZGVzKCksdGhpcy5fZHJhd0d1aWRlKHRoaXMuX21hcC5sYXRMbmdUb0xheWVyUG9pbnQodGhpcy5fbWFya2Vyc1tlLTFdLmdldExhdExuZygpKSx0KSl9LF91cGRhdGVUb29sdGlwOmZ1bmN0aW9uKHQpe3ZhciBlPXRoaXMuX2dldFRvb2x0aXBUZXh0KCk7dCYmdGhpcy5fdG9vbHRpcC51cGRhdGVQb3NpdGlvbih0KSx0aGlzLl9lcnJvclNob3dufHx0aGlzLl90b29sdGlwLnVwZGF0ZUNvbnRlbnQoZSl9LF9kcmF3R3VpZGU6ZnVuY3Rpb24odCxlKXt2YXIgaSxvLGEscz1NYXRoLmZsb29yKE1hdGguc3FydChNYXRoLnBvdyhlLngtdC54LDIpK01hdGgucG93KGUueS10LnksMikpKSxyPXRoaXMub3B0aW9ucy5ndWlkZWxpbmVEaXN0YW5jZSxuPXRoaXMub3B0aW9ucy5tYXhHdWlkZUxpbmVMZW5ndGgsbD1zPm4/cy1uOnI7Zm9yKHRoaXMuX2d1aWRlc0NvbnRhaW5lcnx8KHRoaXMuX2d1aWRlc0NvbnRhaW5lcj1MLkRvbVV0aWwuY3JlYXRlKFwiZGl2XCIsXCJsZWFmbGV0LWRyYXctZ3VpZGVzXCIsdGhpcy5fb3ZlcmxheVBhbmUpKTtzPmw7bCs9dGhpcy5vcHRpb25zLmd1aWRlbGluZURpc3RhbmNlKWk9bC9zLG89e3g6TWF0aC5mbG9vcih0LngqKDEtaSkraSplLngpLHk6TWF0aC5mbG9vcih0LnkqKDEtaSkraSplLnkpfSxhPUwuRG9tVXRpbC5jcmVhdGUoXCJkaXZcIixcImxlYWZsZXQtZHJhdy1ndWlkZS1kYXNoXCIsdGhpcy5fZ3VpZGVzQ29udGFpbmVyKSxhLnN0eWxlLmJhY2tncm91bmRDb2xvcj10aGlzLl9lcnJvclNob3duP3RoaXMub3B0aW9ucy5kcmF3RXJyb3IuY29sb3I6dGhpcy5vcHRpb25zLnNoYXBlT3B0aW9ucy5jb2xvcixMLkRvbVV0aWwuc2V0UG9zaXRpb24oYSxvKX0sX3VwZGF0ZUd1aWRlQ29sb3I6ZnVuY3Rpb24odCl7aWYodGhpcy5fZ3VpZGVzQ29udGFpbmVyKWZvcih2YXIgZT0wLGk9dGhpcy5fZ3VpZGVzQ29udGFpbmVyLmNoaWxkTm9kZXMubGVuZ3RoO2k+ZTtlKyspdGhpcy5fZ3VpZGVzQ29udGFpbmVyLmNoaWxkTm9kZXNbZV0uc3R5bGUuYmFja2dyb3VuZENvbG9yPXR9LF9jbGVhckd1aWRlczpmdW5jdGlvbigpe2lmKHRoaXMuX2d1aWRlc0NvbnRhaW5lcilmb3IoO3RoaXMuX2d1aWRlc0NvbnRhaW5lci5maXJzdENoaWxkOyl0aGlzLl9ndWlkZXNDb250YWluZXIucmVtb3ZlQ2hpbGQodGhpcy5fZ3VpZGVzQ29udGFpbmVyLmZpcnN0Q2hpbGQpfSxfZ2V0VG9vbHRpcFRleHQ6ZnVuY3Rpb24oKXt2YXIgdCxlLGk9dGhpcy5vcHRpb25zLnNob3dMZW5ndGg7cmV0dXJuIDA9PT10aGlzLl9tYXJrZXJzLmxlbmd0aD90PXt0ZXh0OkwuZHJhd0xvY2FsLmRyYXcuaGFuZGxlcnMucG9seWxpbmUudG9vbHRpcC5zdGFydH06KGU9aT90aGlzLl9nZXRNZWFzdXJlbWVudFN0cmluZygpOlwiXCIsdD0xPT09dGhpcy5fbWFya2Vycy5sZW5ndGg/e3RleHQ6TC5kcmF3TG9jYWwuZHJhdy5oYW5kbGVycy5wb2x5bGluZS50b29sdGlwLmNvbnQsc3VidGV4dDplfTp7dGV4dDpMLmRyYXdMb2NhbC5kcmF3LmhhbmRsZXJzLnBvbHlsaW5lLnRvb2x0aXAuZW5kLHN1YnRleHQ6ZX0pLHR9LF91cGRhdGVSdW5uaW5nTWVhc3VyZTpmdW5jdGlvbih0LGUpe3ZhciBpLG8sYT10aGlzLl9tYXJrZXJzLmxlbmd0aDsxPT09dGhpcy5fbWFya2Vycy5sZW5ndGg/dGhpcy5fbWVhc3VyZW1lbnRSdW5uaW5nVG90YWw9MDooaT1hLShlPzI6MSksbz10LmRpc3RhbmNlVG8odGhpcy5fbWFya2Vyc1tpXS5nZXRMYXRMbmcoKSksdGhpcy5fbWVhc3VyZW1lbnRSdW5uaW5nVG90YWwrPW8qKGU/MTotMSkpfSxfZ2V0TWVhc3VyZW1lbnRTdHJpbmc6ZnVuY3Rpb24oKXt2YXIgdCxlPXRoaXMuX2N1cnJlbnRMYXRMbmcsaT10aGlzLl9tYXJrZXJzW3RoaXMuX21hcmtlcnMubGVuZ3RoLTFdLmdldExhdExuZygpO3JldHVybiB0PXRoaXMuX21lYXN1cmVtZW50UnVubmluZ1RvdGFsK2UuZGlzdGFuY2VUbyhpKSxMLkdlb21ldHJ5VXRpbC5yZWFkYWJsZURpc3RhbmNlKHQsdGhpcy5vcHRpb25zLm1ldHJpYyl9LF9zaG93RXJyb3JUb29sdGlwOmZ1bmN0aW9uKCl7dGhpcy5fZXJyb3JTaG93bj0hMCx0aGlzLl90b29sdGlwLnNob3dBc0Vycm9yKCkudXBkYXRlQ29udGVudCh7dGV4dDp0aGlzLm9wdGlvbnMuZHJhd0Vycm9yLm1lc3NhZ2V9KSx0aGlzLl91cGRhdGVHdWlkZUNvbG9yKHRoaXMub3B0aW9ucy5kcmF3RXJyb3IuY29sb3IpLHRoaXMuX3BvbHkuc2V0U3R5bGUoe2NvbG9yOnRoaXMub3B0aW9ucy5kcmF3RXJyb3IuY29sb3J9KSx0aGlzLl9jbGVhckhpZGVFcnJvclRpbWVvdXQoKSx0aGlzLl9oaWRlRXJyb3JUaW1lb3V0PXNldFRpbWVvdXQoTC5VdGlsLmJpbmQodGhpcy5faGlkZUVycm9yVG9vbHRpcCx0aGlzKSx0aGlzLm9wdGlvbnMuZHJhd0Vycm9yLnRpbWVvdXQpfSxfaGlkZUVycm9yVG9vbHRpcDpmdW5jdGlvbigpe3RoaXMuX2Vycm9yU2hvd249ITEsdGhpcy5fY2xlYXJIaWRlRXJyb3JUaW1lb3V0KCksdGhpcy5fdG9vbHRpcC5yZW1vdmVFcnJvcigpLnVwZGF0ZUNvbnRlbnQodGhpcy5fZ2V0VG9vbHRpcFRleHQoKSksdGhpcy5fdXBkYXRlR3VpZGVDb2xvcih0aGlzLm9wdGlvbnMuc2hhcGVPcHRpb25zLmNvbG9yKSx0aGlzLl9wb2x5LnNldFN0eWxlKHtjb2xvcjp0aGlzLm9wdGlvbnMuc2hhcGVPcHRpb25zLmNvbG9yfSl9LF9jbGVhckhpZGVFcnJvclRpbWVvdXQ6ZnVuY3Rpb24oKXt0aGlzLl9oaWRlRXJyb3JUaW1lb3V0JiYoY2xlYXJUaW1lb3V0KHRoaXMuX2hpZGVFcnJvclRpbWVvdXQpLHRoaXMuX2hpZGVFcnJvclRpbWVvdXQ9bnVsbCl9LF9jbGVhblVwU2hhcGU6ZnVuY3Rpb24oKXt0aGlzLl9tYXJrZXJzLmxlbmd0aD4xJiZ0aGlzLl9tYXJrZXJzW3RoaXMuX21hcmtlcnMubGVuZ3RoLTFdLm9mZihcImNsaWNrXCIsdGhpcy5fZmluaXNoU2hhcGUsdGhpcyl9LF9maXJlQ3JlYXRlZEV2ZW50OmZ1bmN0aW9uKCl7dmFyIHQ9bmV3IHRoaXMuUG9seSh0aGlzLl9wb2x5LmdldExhdExuZ3MoKSx0aGlzLm9wdGlvbnMuc2hhcGVPcHRpb25zKTtMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUuX2ZpcmVDcmVhdGVkRXZlbnQuY2FsbCh0aGlzLHQpfX0pLEwuRHJhdy5Qb2x5Z29uPUwuRHJhdy5Qb2x5bGluZS5leHRlbmQoe3N0YXRpY3M6e1RZUEU6XCJwb2x5Z29uXCJ9LFBvbHk6TC5Qb2x5Z29uLG9wdGlvbnM6e3Nob3dBcmVhOiExLHNoYXBlT3B0aW9uczp7c3Ryb2tlOiEwLGNvbG9yOlwiI2YwNmVhYVwiLHdlaWdodDo0LG9wYWNpdHk6LjUsZmlsbDohMCxmaWxsQ29sb3I6bnVsbCxmaWxsT3BhY2l0eTouMixjbGlja2FibGU6ITB9fSxpbml0aWFsaXplOmZ1bmN0aW9uKHQsZSl7TC5EcmF3LlBvbHlsaW5lLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcyx0LGUpLHRoaXMudHlwZT1MLkRyYXcuUG9seWdvbi5UWVBFfSxfdXBkYXRlRmluaXNoSGFuZGxlcjpmdW5jdGlvbigpe3ZhciB0PXRoaXMuX21hcmtlcnMubGVuZ3RoOzE9PT10JiZ0aGlzLl9tYXJrZXJzWzBdLm9uKFwiY2xpY2tcIix0aGlzLl9maW5pc2hTaGFwZSx0aGlzKSx0PjImJih0aGlzLl9tYXJrZXJzW3QtMV0ub24oXCJkYmxjbGlja1wiLHRoaXMuX2ZpbmlzaFNoYXBlLHRoaXMpLHQ+MyYmdGhpcy5fbWFya2Vyc1t0LTJdLm9mZihcImRibGNsaWNrXCIsdGhpcy5fZmluaXNoU2hhcGUsdGhpcykpfSxfZ2V0VG9vbHRpcFRleHQ6ZnVuY3Rpb24oKXt2YXIgdCxlO3JldHVybiAwPT09dGhpcy5fbWFya2Vycy5sZW5ndGg/dD1MLmRyYXdMb2NhbC5kcmF3LmhhbmRsZXJzLnBvbHlnb24udG9vbHRpcC5zdGFydDp0aGlzLl9tYXJrZXJzLmxlbmd0aDwzP3Q9TC5kcmF3TG9jYWwuZHJhdy5oYW5kbGVycy5wb2x5Z29uLnRvb2x0aXAuY29udDoodD1MLmRyYXdMb2NhbC5kcmF3LmhhbmRsZXJzLnBvbHlnb24udG9vbHRpcC5lbmQsZT10aGlzLl9nZXRNZWFzdXJlbWVudFN0cmluZygpKSx7dGV4dDp0LHN1YnRleHQ6ZX19LF9nZXRNZWFzdXJlbWVudFN0cmluZzpmdW5jdGlvbigpe3ZhciB0PXRoaXMuX2FyZWE7cmV0dXJuIHQ/TC5HZW9tZXRyeVV0aWwucmVhZGFibGVBcmVhKHQsdGhpcy5vcHRpb25zLm1ldHJpYyk6bnVsbH0sX3NoYXBlSXNWYWxpZDpmdW5jdGlvbigpe3JldHVybiB0aGlzLl9tYXJrZXJzLmxlbmd0aD49M30sX3ZlcnRleENoYW5nZWQ6ZnVuY3Rpb24odCxlKXt2YXIgaTshdGhpcy5vcHRpb25zLmFsbG93SW50ZXJzZWN0aW9uJiZ0aGlzLm9wdGlvbnMuc2hvd0FyZWEmJihpPXRoaXMuX3BvbHkuZ2V0TGF0TG5ncygpLHRoaXMuX2FyZWE9TC5HZW9tZXRyeVV0aWwuZ2VvZGVzaWNBcmVhKGkpKSxMLkRyYXcuUG9seWxpbmUucHJvdG90eXBlLl92ZXJ0ZXhDaGFuZ2VkLmNhbGwodGhpcyx0LGUpfSxfY2xlYW5VcFNoYXBlOmZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5fbWFya2Vycy5sZW5ndGg7dD4wJiYodGhpcy5fbWFya2Vyc1swXS5vZmYoXCJjbGlja1wiLHRoaXMuX2ZpbmlzaFNoYXBlLHRoaXMpLHQ+MiYmdGhpcy5fbWFya2Vyc1t0LTFdLm9mZihcImRibGNsaWNrXCIsdGhpcy5fZmluaXNoU2hhcGUsdGhpcykpfX0pLEwuU2ltcGxlU2hhcGU9e30sTC5EcmF3LlNpbXBsZVNoYXBlPUwuRHJhdy5GZWF0dXJlLmV4dGVuZCh7b3B0aW9uczp7cmVwZWF0TW9kZTohMX0saW5pdGlhbGl6ZTpmdW5jdGlvbih0LGUpe3RoaXMuX2VuZExhYmVsVGV4dD1MLmRyYXdMb2NhbC5kcmF3LmhhbmRsZXJzLnNpbXBsZXNoYXBlLnRvb2x0aXAuZW5kLEwuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcyx0LGUpfSxhZGRIb29rczpmdW5jdGlvbigpe0wuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5hZGRIb29rcy5jYWxsKHRoaXMpLHRoaXMuX21hcCYmKHRoaXMuX21hcERyYWdnYWJsZT10aGlzLl9tYXAuZHJhZ2dpbmcuZW5hYmxlZCgpLHRoaXMuX21hcERyYWdnYWJsZSYmdGhpcy5fbWFwLmRyYWdnaW5nLmRpc2FibGUoKSx0aGlzLl9jb250YWluZXIuc3R5bGUuY3Vyc29yPVwiY3Jvc3NoYWlyXCIsdGhpcy5fdG9vbHRpcC51cGRhdGVDb250ZW50KHt0ZXh0OnRoaXMuX2luaXRpYWxMYWJlbFRleHR9KSx0aGlzLl9tYXAub24oXCJtb3VzZWRvd25cIix0aGlzLl9vbk1vdXNlRG93bix0aGlzKS5vbihcIm1vdXNlbW92ZVwiLHRoaXMuX29uTW91c2VNb3ZlLHRoaXMpKX0scmVtb3ZlSG9va3M6ZnVuY3Rpb24oKXtMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUucmVtb3ZlSG9va3MuY2FsbCh0aGlzKSx0aGlzLl9tYXAmJih0aGlzLl9tYXBEcmFnZ2FibGUmJnRoaXMuX21hcC5kcmFnZ2luZy5lbmFibGUoKSx0aGlzLl9jb250YWluZXIuc3R5bGUuY3Vyc29yPVwiXCIsdGhpcy5fbWFwLm9mZihcIm1vdXNlZG93blwiLHRoaXMuX29uTW91c2VEb3duLHRoaXMpLm9mZihcIm1vdXNlbW92ZVwiLHRoaXMuX29uTW91c2VNb3ZlLHRoaXMpLEwuRG9tRXZlbnQub2ZmKGUsXCJtb3VzZXVwXCIsdGhpcy5fb25Nb3VzZVVwLHRoaXMpLHRoaXMuX3NoYXBlJiYodGhpcy5fbWFwLnJlbW92ZUxheWVyKHRoaXMuX3NoYXBlKSxkZWxldGUgdGhpcy5fc2hhcGUpKSx0aGlzLl9pc0RyYXdpbmc9ITF9LF9vbk1vdXNlRG93bjpmdW5jdGlvbih0KXt0aGlzLl9pc0RyYXdpbmc9ITAsdGhpcy5fc3RhcnRMYXRMbmc9dC5sYXRsbmcsTC5Eb21FdmVudC5vbihlLFwibW91c2V1cFwiLHRoaXMuX29uTW91c2VVcCx0aGlzKS5wcmV2ZW50RGVmYXVsdCh0Lm9yaWdpbmFsRXZlbnQpfSxfb25Nb3VzZU1vdmU6ZnVuY3Rpb24odCl7dmFyIGU9dC5sYXRsbmc7dGhpcy5fdG9vbHRpcC51cGRhdGVQb3NpdGlvbihlKSx0aGlzLl9pc0RyYXdpbmcmJih0aGlzLl90b29sdGlwLnVwZGF0ZUNvbnRlbnQoe3RleHQ6dGhpcy5fZW5kTGFiZWxUZXh0fSksdGhpcy5fZHJhd1NoYXBlKGUpKX0sX29uTW91c2VVcDpmdW5jdGlvbigpe3RoaXMuX3NoYXBlJiZ0aGlzLl9maXJlQ3JlYXRlZEV2ZW50KCksdGhpcy5kaXNhYmxlKCksdGhpcy5vcHRpb25zLnJlcGVhdE1vZGUmJnRoaXMuZW5hYmxlKCl9fSksTC5EcmF3LlJlY3RhbmdsZT1MLkRyYXcuU2ltcGxlU2hhcGUuZXh0ZW5kKHtzdGF0aWNzOntUWVBFOlwicmVjdGFuZ2xlXCJ9LG9wdGlvbnM6e3NoYXBlT3B0aW9uczp7c3Ryb2tlOiEwLGNvbG9yOlwiI2YwNmVhYVwiLHdlaWdodDo0LG9wYWNpdHk6LjUsZmlsbDohMCxmaWxsQ29sb3I6bnVsbCxmaWxsT3BhY2l0eTouMixjbGlja2FibGU6ITB9fSxpbml0aWFsaXplOmZ1bmN0aW9uKHQsZSl7dGhpcy50eXBlPUwuRHJhdy5SZWN0YW5nbGUuVFlQRSx0aGlzLl9pbml0aWFsTGFiZWxUZXh0PUwuZHJhd0xvY2FsLmRyYXcuaGFuZGxlcnMucmVjdGFuZ2xlLnRvb2x0aXAuc3RhcnQsTC5EcmF3LlNpbXBsZVNoYXBlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcyx0LGUpfSxfZHJhd1NoYXBlOmZ1bmN0aW9uKHQpe3RoaXMuX3NoYXBlP3RoaXMuX3NoYXBlLnNldEJvdW5kcyhuZXcgTC5MYXRMbmdCb3VuZHModGhpcy5fc3RhcnRMYXRMbmcsdCkpOih0aGlzLl9zaGFwZT1uZXcgTC5SZWN0YW5nbGUobmV3IEwuTGF0TG5nQm91bmRzKHRoaXMuX3N0YXJ0TGF0TG5nLHQpLHRoaXMub3B0aW9ucy5zaGFwZU9wdGlvbnMpLHRoaXMuX21hcC5hZGRMYXllcih0aGlzLl9zaGFwZSkpfSxfZmlyZUNyZWF0ZWRFdmVudDpmdW5jdGlvbigpe3ZhciB0PW5ldyBMLlJlY3RhbmdsZSh0aGlzLl9zaGFwZS5nZXRCb3VuZHMoKSx0aGlzLm9wdGlvbnMuc2hhcGVPcHRpb25zKTtMLkRyYXcuU2ltcGxlU2hhcGUucHJvdG90eXBlLl9maXJlQ3JlYXRlZEV2ZW50LmNhbGwodGhpcyx0KX19KSxMLkRyYXcuQ2lyY2xlPUwuRHJhdy5TaW1wbGVTaGFwZS5leHRlbmQoe3N0YXRpY3M6e1RZUEU6XCJjaXJjbGVcIn0sb3B0aW9uczp7c2hhcGVPcHRpb25zOntzdHJva2U6ITAsY29sb3I6XCIjZjA2ZWFhXCIsd2VpZ2h0OjQsb3BhY2l0eTouNSxmaWxsOiEwLGZpbGxDb2xvcjpudWxsLGZpbGxPcGFjaXR5Oi4yLGNsaWNrYWJsZTohMH0sc2hvd1JhZGl1czohMCxtZXRyaWM6ITB9LGluaXRpYWxpemU6ZnVuY3Rpb24odCxlKXt0aGlzLnR5cGU9TC5EcmF3LkNpcmNsZS5UWVBFLHRoaXMuX2luaXRpYWxMYWJlbFRleHQ9TC5kcmF3TG9jYWwuZHJhdy5oYW5kbGVycy5jaXJjbGUudG9vbHRpcC5zdGFydCxMLkRyYXcuU2ltcGxlU2hhcGUucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLHQsZSl9LF9kcmF3U2hhcGU6ZnVuY3Rpb24odCl7dGhpcy5fc2hhcGU/dGhpcy5fc2hhcGUuc2V0UmFkaXVzKHRoaXMuX3N0YXJ0TGF0TG5nLmRpc3RhbmNlVG8odCkpOih0aGlzLl9zaGFwZT1uZXcgTC5DaXJjbGUodGhpcy5fc3RhcnRMYXRMbmcsdGhpcy5fc3RhcnRMYXRMbmcuZGlzdGFuY2VUbyh0KSx0aGlzLm9wdGlvbnMuc2hhcGVPcHRpb25zKSx0aGlzLl9tYXAuYWRkTGF5ZXIodGhpcy5fc2hhcGUpKX0sX2ZpcmVDcmVhdGVkRXZlbnQ6ZnVuY3Rpb24oKXt2YXIgdD1uZXcgTC5DaXJjbGUodGhpcy5fc3RhcnRMYXRMbmcsdGhpcy5fc2hhcGUuZ2V0UmFkaXVzKCksdGhpcy5vcHRpb25zLnNoYXBlT3B0aW9ucyk7TC5EcmF3LlNpbXBsZVNoYXBlLnByb3RvdHlwZS5fZmlyZUNyZWF0ZWRFdmVudC5jYWxsKHRoaXMsdCl9LF9vbk1vdXNlTW92ZTpmdW5jdGlvbih0KXt2YXIgZSxpPXQubGF0bG5nLG89dGhpcy5vcHRpb25zLnNob3dSYWRpdXMsYT10aGlzLm9wdGlvbnMubWV0cmljO3RoaXMuX3Rvb2x0aXAudXBkYXRlUG9zaXRpb24oaSksdGhpcy5faXNEcmF3aW5nJiYodGhpcy5fZHJhd1NoYXBlKGkpLGU9dGhpcy5fc2hhcGUuZ2V0UmFkaXVzKCkudG9GaXhlZCgxKSx0aGlzLl90b29sdGlwLnVwZGF0ZUNvbnRlbnQoe3RleHQ6dGhpcy5fZW5kTGFiZWxUZXh0LHN1YnRleHQ6bz9cIlJhZGl1czogXCIrTC5HZW9tZXRyeVV0aWwucmVhZGFibGVEaXN0YW5jZShlLGEpOlwiXCJ9KSl9fSksTC5EcmF3Lk1hcmtlcj1MLkRyYXcuRmVhdHVyZS5leHRlbmQoe3N0YXRpY3M6e1RZUEU6XCJtYXJrZXJcIn0sb3B0aW9uczp7aWNvbjpuZXcgTC5JY29uLkRlZmF1bHQscmVwZWF0TW9kZTohMSx6SW5kZXhPZmZzZXQ6MmUzfSxpbml0aWFsaXplOmZ1bmN0aW9uKHQsZSl7dGhpcy50eXBlPUwuRHJhdy5NYXJrZXIuVFlQRSxMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsdCxlKX0sYWRkSG9va3M6ZnVuY3Rpb24oKXtMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUuYWRkSG9va3MuY2FsbCh0aGlzKSx0aGlzLl9tYXAmJih0aGlzLl90b29sdGlwLnVwZGF0ZUNvbnRlbnQoe3RleHQ6TC5kcmF3TG9jYWwuZHJhdy5oYW5kbGVycy5tYXJrZXIudG9vbHRpcC5zdGFydH0pLHRoaXMuX21vdXNlTWFya2VyfHwodGhpcy5fbW91c2VNYXJrZXI9TC5tYXJrZXIodGhpcy5fbWFwLmdldENlbnRlcigpLHtpY29uOkwuZGl2SWNvbih7Y2xhc3NOYW1lOlwibGVhZmxldC1tb3VzZS1tYXJrZXJcIixpY29uQW5jaG9yOlsyMCwyMF0saWNvblNpemU6WzQwLDQwXX0pLG9wYWNpdHk6MCx6SW5kZXhPZmZzZXQ6dGhpcy5vcHRpb25zLnpJbmRleE9mZnNldH0pKSx0aGlzLl9tb3VzZU1hcmtlci5vbihcImNsaWNrXCIsdGhpcy5fb25DbGljayx0aGlzKS5hZGRUbyh0aGlzLl9tYXApLHRoaXMuX21hcC5vbihcIm1vdXNlbW92ZVwiLHRoaXMuX29uTW91c2VNb3ZlLHRoaXMpKX0scmVtb3ZlSG9va3M6ZnVuY3Rpb24oKXtMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUucmVtb3ZlSG9va3MuY2FsbCh0aGlzKSx0aGlzLl9tYXAmJih0aGlzLl9tYXJrZXImJih0aGlzLl9tYXJrZXIub2ZmKFwiY2xpY2tcIix0aGlzLl9vbkNsaWNrLHRoaXMpLHRoaXMuX21hcC5vZmYoXCJjbGlja1wiLHRoaXMuX29uQ2xpY2ssdGhpcykucmVtb3ZlTGF5ZXIodGhpcy5fbWFya2VyKSxkZWxldGUgdGhpcy5fbWFya2VyKSx0aGlzLl9tb3VzZU1hcmtlci5vZmYoXCJjbGlja1wiLHRoaXMuX29uQ2xpY2ssdGhpcyksdGhpcy5fbWFwLnJlbW92ZUxheWVyKHRoaXMuX21vdXNlTWFya2VyKSxkZWxldGUgdGhpcy5fbW91c2VNYXJrZXIsdGhpcy5fbWFwLm9mZihcIm1vdXNlbW92ZVwiLHRoaXMuX29uTW91c2VNb3ZlLHRoaXMpKX0sX29uTW91c2VNb3ZlOmZ1bmN0aW9uKHQpe3ZhciBlPXQubGF0bG5nO3RoaXMuX3Rvb2x0aXAudXBkYXRlUG9zaXRpb24oZSksdGhpcy5fbW91c2VNYXJrZXIuc2V0TGF0TG5nKGUpLHRoaXMuX21hcmtlcj8oZT10aGlzLl9tb3VzZU1hcmtlci5nZXRMYXRMbmcoKSx0aGlzLl9tYXJrZXIuc2V0TGF0TG5nKGUpKToodGhpcy5fbWFya2VyPW5ldyBMLk1hcmtlcihlLHtpY29uOnRoaXMub3B0aW9ucy5pY29uLHpJbmRleE9mZnNldDp0aGlzLm9wdGlvbnMuekluZGV4T2Zmc2V0fSksdGhpcy5fbWFya2VyLm9uKFwiY2xpY2tcIix0aGlzLl9vbkNsaWNrLHRoaXMpLHRoaXMuX21hcC5vbihcImNsaWNrXCIsdGhpcy5fb25DbGljayx0aGlzKS5hZGRMYXllcih0aGlzLl9tYXJrZXIpKX0sX29uQ2xpY2s6ZnVuY3Rpb24oKXt0aGlzLl9maXJlQ3JlYXRlZEV2ZW50KCksdGhpcy5kaXNhYmxlKCksdGhpcy5vcHRpb25zLnJlcGVhdE1vZGUmJnRoaXMuZW5hYmxlKCl9LF9maXJlQ3JlYXRlZEV2ZW50OmZ1bmN0aW9uKCl7dmFyIHQ9bmV3IEwuTWFya2VyKHRoaXMuX21hcmtlci5nZXRMYXRMbmcoKSx7aWNvbjp0aGlzLm9wdGlvbnMuaWNvbn0pO0wuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5fZmlyZUNyZWF0ZWRFdmVudC5jYWxsKHRoaXMsdCl9fSksTC5FZGl0PUwuRWRpdHx8e30sTC5FZGl0LlBvbHk9TC5IYW5kbGVyLmV4dGVuZCh7b3B0aW9uczp7aWNvbjpuZXcgTC5EaXZJY29uKHtpY29uU2l6ZTpuZXcgTC5Qb2ludCg4LDgpLGNsYXNzTmFtZTpcImxlYWZsZXQtZGl2LWljb24gbGVhZmxldC1lZGl0aW5nLWljb25cIn0pfSxpbml0aWFsaXplOmZ1bmN0aW9uKHQsZSl7dGhpcy5fcG9seT10LEwuc2V0T3B0aW9ucyh0aGlzLGUpfSxhZGRIb29rczpmdW5jdGlvbigpe3RoaXMuX3BvbHkuX21hcCYmKHRoaXMuX21hcmtlckdyb3VwfHx0aGlzLl9pbml0TWFya2VycygpLHRoaXMuX3BvbHkuX21hcC5hZGRMYXllcih0aGlzLl9tYXJrZXJHcm91cCkpfSxyZW1vdmVIb29rczpmdW5jdGlvbigpe3RoaXMuX3BvbHkuX21hcCYmKHRoaXMuX3BvbHkuX21hcC5yZW1vdmVMYXllcih0aGlzLl9tYXJrZXJHcm91cCksZGVsZXRlIHRoaXMuX21hcmtlckdyb3VwLGRlbGV0ZSB0aGlzLl9tYXJrZXJzKX0sdXBkYXRlTWFya2VyczpmdW5jdGlvbigpe3RoaXMuX21hcmtlckdyb3VwLmNsZWFyTGF5ZXJzKCksdGhpcy5faW5pdE1hcmtlcnMoKX0sX2luaXRNYXJrZXJzOmZ1bmN0aW9uKCl7dGhpcy5fbWFya2VyR3JvdXB8fCh0aGlzLl9tYXJrZXJHcm91cD1uZXcgTC5MYXllckdyb3VwKSx0aGlzLl9tYXJrZXJzPVtdO3ZhciB0LGUsaSxvLGE9dGhpcy5fcG9seS5fbGF0bG5ncztmb3IodD0wLGk9YS5sZW5ndGg7aT50O3QrKylvPXRoaXMuX2NyZWF0ZU1hcmtlcihhW3RdLHQpLG8ub24oXCJjbGlja1wiLHRoaXMuX29uTWFya2VyQ2xpY2ssdGhpcyksdGhpcy5fbWFya2Vycy5wdXNoKG8pO3ZhciBzLHI7Zm9yKHQ9MCxlPWktMTtpPnQ7ZT10KyspKDAhPT10fHxMLlBvbHlnb24mJnRoaXMuX3BvbHkgaW5zdGFuY2VvZiBMLlBvbHlnb24pJiYocz10aGlzLl9tYXJrZXJzW2VdLHI9dGhpcy5fbWFya2Vyc1t0XSx0aGlzLl9jcmVhdGVNaWRkbGVNYXJrZXIocyxyKSx0aGlzLl91cGRhdGVQcmV2TmV4dChzLHIpKX0sX2NyZWF0ZU1hcmtlcjpmdW5jdGlvbih0LGUpe3ZhciBpPW5ldyBMLk1hcmtlcih0LHtkcmFnZ2FibGU6ITAsaWNvbjp0aGlzLm9wdGlvbnMuaWNvbn0pO3JldHVybiBpLl9vcmlnTGF0TG5nPXQsaS5faW5kZXg9ZSxpLm9uKFwiZHJhZ1wiLHRoaXMuX29uTWFya2VyRHJhZyx0aGlzKSxpLm9uKFwiZHJhZ2VuZFwiLHRoaXMuX2ZpcmVFZGl0LHRoaXMpLHRoaXMuX21hcmtlckdyb3VwLmFkZExheWVyKGkpLGl9LF9yZW1vdmVNYXJrZXI6ZnVuY3Rpb24odCl7dmFyIGU9dC5faW5kZXg7dGhpcy5fbWFya2VyR3JvdXAucmVtb3ZlTGF5ZXIodCksdGhpcy5fbWFya2Vycy5zcGxpY2UoZSwxKSx0aGlzLl9wb2x5LnNwbGljZUxhdExuZ3MoZSwxKSx0aGlzLl91cGRhdGVJbmRleGVzKGUsLTEpLHQub2ZmKFwiZHJhZ1wiLHRoaXMuX29uTWFya2VyRHJhZyx0aGlzKS5vZmYoXCJkcmFnZW5kXCIsdGhpcy5fZmlyZUVkaXQsdGhpcykub2ZmKFwiY2xpY2tcIix0aGlzLl9vbk1hcmtlckNsaWNrLHRoaXMpfSxfZmlyZUVkaXQ6ZnVuY3Rpb24oKXt0aGlzLl9wb2x5LmVkaXRlZD0hMCx0aGlzLl9wb2x5LmZpcmUoXCJlZGl0XCIpfSxfb25NYXJrZXJEcmFnOmZ1bmN0aW9uKHQpe3ZhciBlPXQudGFyZ2V0O0wuZXh0ZW5kKGUuX29yaWdMYXRMbmcsZS5fbGF0bG5nKSxlLl9taWRkbGVMZWZ0JiZlLl9taWRkbGVMZWZ0LnNldExhdExuZyh0aGlzLl9nZXRNaWRkbGVMYXRMbmcoZS5fcHJldixlKSksZS5fbWlkZGxlUmlnaHQmJmUuX21pZGRsZVJpZ2h0LnNldExhdExuZyh0aGlzLl9nZXRNaWRkbGVMYXRMbmcoZSxlLl9uZXh0KSksdGhpcy5fcG9seS5yZWRyYXcoKX0sX29uTWFya2VyQ2xpY2s6ZnVuY3Rpb24odCl7dmFyIGU9TC5Qb2x5Z29uJiZ0aGlzLl9wb2x5IGluc3RhbmNlb2YgTC5Qb2x5Z29uPzQ6MyxpPXQudGFyZ2V0O3RoaXMuX3BvbHkuX2xhdGxuZ3MubGVuZ3RoPGV8fCh0aGlzLl9yZW1vdmVNYXJrZXIoaSksdGhpcy5fdXBkYXRlUHJldk5leHQoaS5fcHJldixpLl9uZXh0KSxpLl9taWRkbGVMZWZ0JiZ0aGlzLl9tYXJrZXJHcm91cC5yZW1vdmVMYXllcihpLl9taWRkbGVMZWZ0KSxpLl9taWRkbGVSaWdodCYmdGhpcy5fbWFya2VyR3JvdXAucmVtb3ZlTGF5ZXIoaS5fbWlkZGxlUmlnaHQpLGkuX3ByZXYmJmkuX25leHQ/dGhpcy5fY3JlYXRlTWlkZGxlTWFya2VyKGkuX3ByZXYsaS5fbmV4dCk6aS5fcHJldj9pLl9uZXh0fHwoaS5fcHJldi5fbWlkZGxlUmlnaHQ9bnVsbCk6aS5fbmV4dC5fbWlkZGxlTGVmdD1udWxsLHRoaXMuX2ZpcmVFZGl0KCkpfSxfdXBkYXRlSW5kZXhlczpmdW5jdGlvbih0LGUpe3RoaXMuX21hcmtlckdyb3VwLmVhY2hMYXllcihmdW5jdGlvbihpKXtpLl9pbmRleD50JiYoaS5faW5kZXgrPWUpfSl9LF9jcmVhdGVNaWRkbGVNYXJrZXI6ZnVuY3Rpb24odCxlKXt2YXIgaSxvLGEscz10aGlzLl9nZXRNaWRkbGVMYXRMbmcodCxlKSxyPXRoaXMuX2NyZWF0ZU1hcmtlcihzKTtyLnNldE9wYWNpdHkoLjYpLHQuX21pZGRsZVJpZ2h0PWUuX21pZGRsZUxlZnQ9cixvPWZ1bmN0aW9uKCl7dmFyIG89ZS5faW5kZXg7ci5faW5kZXg9byxyLm9mZihcImNsaWNrXCIsaSx0aGlzKS5vbihcImNsaWNrXCIsdGhpcy5fb25NYXJrZXJDbGljayx0aGlzKSxzLmxhdD1yLmdldExhdExuZygpLmxhdCxzLmxuZz1yLmdldExhdExuZygpLmxuZyx0aGlzLl9wb2x5LnNwbGljZUxhdExuZ3MobywwLHMpLHRoaXMuX21hcmtlcnMuc3BsaWNlKG8sMCxyKSxyLnNldE9wYWNpdHkoMSksdGhpcy5fdXBkYXRlSW5kZXhlcyhvLDEpLGUuX2luZGV4KyssdGhpcy5fdXBkYXRlUHJldk5leHQodCxyKSx0aGlzLl91cGRhdGVQcmV2TmV4dChyLGUpLHRoaXMuX3BvbHkuZmlyZShcImVkaXRzdGFydFwiKX0sYT1mdW5jdGlvbigpe3Iub2ZmKFwiZHJhZ3N0YXJ0XCIsbyx0aGlzKSxyLm9mZihcImRyYWdlbmRcIixhLHRoaXMpLHRoaXMuX2NyZWF0ZU1pZGRsZU1hcmtlcih0LHIpLHRoaXMuX2NyZWF0ZU1pZGRsZU1hcmtlcihyLGUpfSxpPWZ1bmN0aW9uKCl7by5jYWxsKHRoaXMpLGEuY2FsbCh0aGlzKSx0aGlzLl9maXJlRWRpdCgpfSxyLm9uKFwiY2xpY2tcIixpLHRoaXMpLm9uKFwiZHJhZ3N0YXJ0XCIsbyx0aGlzKS5vbihcImRyYWdlbmRcIixhLHRoaXMpLHRoaXMuX21hcmtlckdyb3VwLmFkZExheWVyKHIpfSxfdXBkYXRlUHJldk5leHQ6ZnVuY3Rpb24odCxlKXt0JiYodC5fbmV4dD1lKSxlJiYoZS5fcHJldj10KX0sX2dldE1pZGRsZUxhdExuZzpmdW5jdGlvbih0LGUpe3ZhciBpPXRoaXMuX3BvbHkuX21hcCxvPWkucHJvamVjdCh0LmdldExhdExuZygpKSxhPWkucHJvamVjdChlLmdldExhdExuZygpKTtyZXR1cm4gaS51bnByb2plY3Qoby5fYWRkKGEpLl9kaXZpZGVCeSgyKSl9fSksTC5Qb2x5bGluZS5hZGRJbml0SG9vayhmdW5jdGlvbigpe3RoaXMuZWRpdGluZ3x8KEwuRWRpdC5Qb2x5JiYodGhpcy5lZGl0aW5nPW5ldyBMLkVkaXQuUG9seSh0aGlzKSx0aGlzLm9wdGlvbnMuZWRpdGFibGUmJnRoaXMuZWRpdGluZy5lbmFibGUoKSksdGhpcy5vbihcImFkZFwiLGZ1bmN0aW9uKCl7dGhpcy5lZGl0aW5nJiZ0aGlzLmVkaXRpbmcuZW5hYmxlZCgpJiZ0aGlzLmVkaXRpbmcuYWRkSG9va3MoKX0pLHRoaXMub24oXCJyZW1vdmVcIixmdW5jdGlvbigpe3RoaXMuZWRpdGluZyYmdGhpcy5lZGl0aW5nLmVuYWJsZWQoKSYmdGhpcy5lZGl0aW5nLnJlbW92ZUhvb2tzKCl9KSl9KSxMLkVkaXQ9TC5FZGl0fHx7fSxMLkVkaXQuU2ltcGxlU2hhcGU9TC5IYW5kbGVyLmV4dGVuZCh7b3B0aW9uczp7bW92ZUljb246bmV3IEwuRGl2SWNvbih7aWNvblNpemU6bmV3IEwuUG9pbnQoOCw4KSxjbGFzc05hbWU6XCJsZWFmbGV0LWRpdi1pY29uIGxlYWZsZXQtZWRpdGluZy1pY29uIGxlYWZsZXQtZWRpdC1tb3ZlXCJ9KSxyZXNpemVJY29uOm5ldyBMLkRpdkljb24oe2ljb25TaXplOm5ldyBMLlBvaW50KDgsOCksY2xhc3NOYW1lOlwibGVhZmxldC1kaXYtaWNvbiBsZWFmbGV0LWVkaXRpbmctaWNvbiBsZWFmbGV0LWVkaXQtcmVzaXplXCJ9KX0saW5pdGlhbGl6ZTpmdW5jdGlvbih0LGUpe3RoaXMuX3NoYXBlPXQsTC5VdGlsLnNldE9wdGlvbnModGhpcyxlKX0sYWRkSG9va3M6ZnVuY3Rpb24oKXt0aGlzLl9zaGFwZS5fbWFwJiYodGhpcy5fbWFwPXRoaXMuX3NoYXBlLl9tYXAsdGhpcy5fbWFya2VyR3JvdXB8fHRoaXMuX2luaXRNYXJrZXJzKCksdGhpcy5fbWFwLmFkZExheWVyKHRoaXMuX21hcmtlckdyb3VwKSl9LHJlbW92ZUhvb2tzOmZ1bmN0aW9uKCl7aWYodGhpcy5fc2hhcGUuX21hcCl7dGhpcy5fdW5iaW5kTWFya2VyKHRoaXMuX21vdmVNYXJrZXIpO2Zvcih2YXIgdD0wLGU9dGhpcy5fcmVzaXplTWFya2Vycy5sZW5ndGg7ZT50O3QrKyl0aGlzLl91bmJpbmRNYXJrZXIodGhpcy5fcmVzaXplTWFya2Vyc1t0XSk7dGhpcy5fcmVzaXplTWFya2Vycz1udWxsLHRoaXMuX21hcC5yZW1vdmVMYXllcih0aGlzLl9tYXJrZXJHcm91cCksZGVsZXRlIHRoaXMuX21hcmtlckdyb3VwfXRoaXMuX21hcD1udWxsfSx1cGRhdGVNYXJrZXJzOmZ1bmN0aW9uKCl7dGhpcy5fbWFya2VyR3JvdXAuY2xlYXJMYXllcnMoKSx0aGlzLl9pbml0TWFya2VycygpfSxfaW5pdE1hcmtlcnM6ZnVuY3Rpb24oKXt0aGlzLl9tYXJrZXJHcm91cHx8KHRoaXMuX21hcmtlckdyb3VwPW5ldyBMLkxheWVyR3JvdXApLHRoaXMuX2NyZWF0ZU1vdmVNYXJrZXIoKSx0aGlzLl9jcmVhdGVSZXNpemVNYXJrZXIoKX0sX2NyZWF0ZU1vdmVNYXJrZXI6ZnVuY3Rpb24oKXt9LF9jcmVhdGVSZXNpemVNYXJrZXI6ZnVuY3Rpb24oKXt9LF9jcmVhdGVNYXJrZXI6ZnVuY3Rpb24odCxlKXt2YXIgaT1uZXcgTC5NYXJrZXIodCx7ZHJhZ2dhYmxlOiEwLGljb246ZSx6SW5kZXhPZmZzZXQ6MTB9KTtyZXR1cm4gdGhpcy5fYmluZE1hcmtlcihpKSx0aGlzLl9tYXJrZXJHcm91cC5hZGRMYXllcihpKSxpfSxfYmluZE1hcmtlcjpmdW5jdGlvbih0KXt0Lm9uKFwiZHJhZ3N0YXJ0XCIsdGhpcy5fb25NYXJrZXJEcmFnU3RhcnQsdGhpcykub24oXCJkcmFnXCIsdGhpcy5fb25NYXJrZXJEcmFnLHRoaXMpLm9uKFwiZHJhZ2VuZFwiLHRoaXMuX29uTWFya2VyRHJhZ0VuZCx0aGlzKX0sX3VuYmluZE1hcmtlcjpmdW5jdGlvbih0KXt0Lm9mZihcImRyYWdzdGFydFwiLHRoaXMuX29uTWFya2VyRHJhZ1N0YXJ0LHRoaXMpLm9mZihcImRyYWdcIix0aGlzLl9vbk1hcmtlckRyYWcsdGhpcykub2ZmKFwiZHJhZ2VuZFwiLHRoaXMuX29uTWFya2VyRHJhZ0VuZCx0aGlzKX0sX29uTWFya2VyRHJhZ1N0YXJ0OmZ1bmN0aW9uKHQpe3ZhciBlPXQudGFyZ2V0O2Uuc2V0T3BhY2l0eSgwKSx0aGlzLl9zaGFwZS5maXJlKFwiZWRpdHN0YXJ0XCIpfSxfZmlyZUVkaXQ6ZnVuY3Rpb24oKXt0aGlzLl9zaGFwZS5lZGl0ZWQ9ITAsdGhpcy5fc2hhcGUuZmlyZShcImVkaXRcIil9LF9vbk1hcmtlckRyYWc6ZnVuY3Rpb24odCl7dmFyIGU9dC50YXJnZXQsaT1lLmdldExhdExuZygpO2U9PT10aGlzLl9tb3ZlTWFya2VyP3RoaXMuX21vdmUoaSk6dGhpcy5fcmVzaXplKGkpLHRoaXMuX3NoYXBlLnJlZHJhdygpfSxfb25NYXJrZXJEcmFnRW5kOmZ1bmN0aW9uKHQpe3ZhciBlPXQudGFyZ2V0O2Uuc2V0T3BhY2l0eSgxKSx0aGlzLl9maXJlRWRpdCgpfSxfbW92ZTpmdW5jdGlvbigpe30sX3Jlc2l6ZTpmdW5jdGlvbigpe319KSxMLkVkaXQ9TC5FZGl0fHx7fSxMLkVkaXQuUmVjdGFuZ2xlPUwuRWRpdC5TaW1wbGVTaGFwZS5leHRlbmQoe19jcmVhdGVNb3ZlTWFya2VyOmZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5fc2hhcGUuZ2V0Qm91bmRzKCksZT10LmdldENlbnRlcigpO3RoaXMuX21vdmVNYXJrZXI9dGhpcy5fY3JlYXRlTWFya2VyKGUsdGhpcy5vcHRpb25zLm1vdmVJY29uKX0sX2NyZWF0ZVJlc2l6ZU1hcmtlcjpmdW5jdGlvbigpe3ZhciB0PXRoaXMuX2dldENvcm5lcnMoKTt0aGlzLl9yZXNpemVNYXJrZXJzPVtdO2Zvcih2YXIgZT0wLGk9dC5sZW5ndGg7aT5lO2UrKyl0aGlzLl9yZXNpemVNYXJrZXJzLnB1c2godGhpcy5fY3JlYXRlTWFya2VyKHRbZV0sdGhpcy5vcHRpb25zLnJlc2l6ZUljb24pKSx0aGlzLl9yZXNpemVNYXJrZXJzW2VdLl9jb3JuZXJJbmRleD1lfSxfb25NYXJrZXJEcmFnU3RhcnQ6ZnVuY3Rpb24odCl7TC5FZGl0LlNpbXBsZVNoYXBlLnByb3RvdHlwZS5fb25NYXJrZXJEcmFnU3RhcnQuY2FsbCh0aGlzLHQpO3ZhciBlPXRoaXMuX2dldENvcm5lcnMoKSxpPXQudGFyZ2V0LG89aS5fY29ybmVySW5kZXg7dGhpcy5fb3Bwb3NpdGVDb3JuZXI9ZVsobysyKSU0XSx0aGlzLl90b2dnbGVDb3JuZXJNYXJrZXJzKDAsbyl9LF9vbk1hcmtlckRyYWdFbmQ6ZnVuY3Rpb24odCl7dmFyIGUsaSxvPXQudGFyZ2V0O289PT10aGlzLl9tb3ZlTWFya2VyJiYoZT10aGlzLl9zaGFwZS5nZXRCb3VuZHMoKSxpPWUuZ2V0Q2VudGVyKCksby5zZXRMYXRMbmcoaSkpLHRoaXMuX3RvZ2dsZUNvcm5lck1hcmtlcnMoMSksdGhpcy5fcmVwb3NpdGlvbkNvcm5lck1hcmtlcnMoKSxMLkVkaXQuU2ltcGxlU2hhcGUucHJvdG90eXBlLl9vbk1hcmtlckRyYWdFbmQuY2FsbCh0aGlzLHQpfSxfbW92ZTpmdW5jdGlvbih0KXtmb3IodmFyIGUsaT10aGlzLl9zaGFwZS5nZXRMYXRMbmdzKCksbz10aGlzLl9zaGFwZS5nZXRCb3VuZHMoKSxhPW8uZ2V0Q2VudGVyKCkscz1bXSxyPTAsbj1pLmxlbmd0aDtuPnI7cisrKWU9W2lbcl0ubGF0LWEubGF0LGlbcl0ubG5nLWEubG5nXSxzLnB1c2goW3QubGF0K2VbMF0sdC5sbmcrZVsxXV0pO3RoaXMuX3NoYXBlLnNldExhdExuZ3MocyksdGhpcy5fcmVwb3NpdGlvbkNvcm5lck1hcmtlcnMoKX0sX3Jlc2l6ZTpmdW5jdGlvbih0KXt2YXIgZTt0aGlzLl9zaGFwZS5zZXRCb3VuZHMoTC5sYXRMbmdCb3VuZHModCx0aGlzLl9vcHBvc2l0ZUNvcm5lcikpLGU9dGhpcy5fc2hhcGUuZ2V0Qm91bmRzKCksdGhpcy5fbW92ZU1hcmtlci5zZXRMYXRMbmcoZS5nZXRDZW50ZXIoKSl9LF9nZXRDb3JuZXJzOmZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5fc2hhcGUuZ2V0Qm91bmRzKCksZT10LmdldE5vcnRoV2VzdCgpLGk9dC5nZXROb3J0aEVhc3QoKSxvPXQuZ2V0U291dGhFYXN0KCksYT10LmdldFNvdXRoV2VzdCgpO3JldHVybltlLGksbyxhXX0sX3RvZ2dsZUNvcm5lck1hcmtlcnM6ZnVuY3Rpb24odCl7Zm9yKHZhciBlPTAsaT10aGlzLl9yZXNpemVNYXJrZXJzLmxlbmd0aDtpPmU7ZSsrKXRoaXMuX3Jlc2l6ZU1hcmtlcnNbZV0uc2V0T3BhY2l0eSh0KX0sX3JlcG9zaXRpb25Db3JuZXJNYXJrZXJzOmZ1bmN0aW9uKCl7Zm9yKHZhciB0PXRoaXMuX2dldENvcm5lcnMoKSxlPTAsaT10aGlzLl9yZXNpemVNYXJrZXJzLmxlbmd0aDtpPmU7ZSsrKXRoaXMuX3Jlc2l6ZU1hcmtlcnNbZV0uc2V0TGF0TG5nKHRbZV0pfX0pLEwuUmVjdGFuZ2xlLmFkZEluaXRIb29rKGZ1bmN0aW9uKCl7TC5FZGl0LlJlY3RhbmdsZSYmKHRoaXMuZWRpdGluZz1uZXcgTC5FZGl0LlJlY3RhbmdsZSh0aGlzKSx0aGlzLm9wdGlvbnMuZWRpdGFibGUmJnRoaXMuZWRpdGluZy5lbmFibGUoKSl9KSxMLkVkaXQ9TC5FZGl0fHx7fSxMLkVkaXQuQ2lyY2xlPUwuRWRpdC5TaW1wbGVTaGFwZS5leHRlbmQoe19jcmVhdGVNb3ZlTWFya2VyOmZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5fc2hhcGUuZ2V0TGF0TG5nKCk7dGhpcy5fbW92ZU1hcmtlcj10aGlzLl9jcmVhdGVNYXJrZXIodCx0aGlzLm9wdGlvbnMubW92ZUljb24pfSxfY3JlYXRlUmVzaXplTWFya2VyOmZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5fc2hhcGUuZ2V0TGF0TG5nKCksZT10aGlzLl9nZXRSZXNpemVNYXJrZXJQb2ludCh0KTt0aGlzLl9yZXNpemVNYXJrZXJzPVtdLHRoaXMuX3Jlc2l6ZU1hcmtlcnMucHVzaCh0aGlzLl9jcmVhdGVNYXJrZXIoZSx0aGlzLm9wdGlvbnMucmVzaXplSWNvbikpfSxfZ2V0UmVzaXplTWFya2VyUG9pbnQ6ZnVuY3Rpb24odCl7dmFyIGU9dGhpcy5fc2hhcGUuX3JhZGl1cypNYXRoLmNvcyhNYXRoLlBJLzQpLGk9dGhpcy5fbWFwLnByb2plY3QodCk7cmV0dXJuIHRoaXMuX21hcC51bnByb2plY3QoW2kueCtlLGkueS1lXSl9LF9tb3ZlOmZ1bmN0aW9uKHQpe3ZhciBlPXRoaXMuX2dldFJlc2l6ZU1hcmtlclBvaW50KHQpO3RoaXMuX3Jlc2l6ZU1hcmtlcnNbMF0uc2V0TGF0TG5nKGUpLHRoaXMuX3NoYXBlLnNldExhdExuZyh0KX0sX3Jlc2l6ZTpmdW5jdGlvbih0KXt2YXIgZT10aGlzLl9tb3ZlTWFya2VyLmdldExhdExuZygpLGk9ZS5kaXN0YW5jZVRvKHQpO3RoaXMuX3NoYXBlLnNldFJhZGl1cyhpKX19KSxMLkNpcmNsZS5hZGRJbml0SG9vayhmdW5jdGlvbigpe0wuRWRpdC5DaXJjbGUmJih0aGlzLmVkaXRpbmc9bmV3IEwuRWRpdC5DaXJjbGUodGhpcyksdGhpcy5vcHRpb25zLmVkaXRhYmxlJiZ0aGlzLmVkaXRpbmcuZW5hYmxlKCkpLHRoaXMub24oXCJhZGRcIixmdW5jdGlvbigpe3RoaXMuZWRpdGluZyYmdGhpcy5lZGl0aW5nLmVuYWJsZWQoKSYmdGhpcy5lZGl0aW5nLmFkZEhvb2tzKCl9KSx0aGlzLm9uKFwicmVtb3ZlXCIsZnVuY3Rpb24oKXt0aGlzLmVkaXRpbmcmJnRoaXMuZWRpdGluZy5lbmFibGVkKCkmJnRoaXMuZWRpdGluZy5yZW1vdmVIb29rcygpfSl9KSxMLkxhdExuZ1V0aWw9e2Nsb25lTGF0TG5nczpmdW5jdGlvbih0KXtmb3IodmFyIGU9W10saT0wLG89dC5sZW5ndGg7bz5pO2krKyllLnB1c2godGhpcy5jbG9uZUxhdExuZyh0W2ldKSk7cmV0dXJuIGV9LGNsb25lTGF0TG5nOmZ1bmN0aW9uKHQpe3JldHVybiBMLmxhdExuZyh0LmxhdCx0LmxuZyl9fSxMLkdlb21ldHJ5VXRpbD1MLmV4dGVuZChMLkdlb21ldHJ5VXRpbHx8e30se2dlb2Rlc2ljQXJlYTpmdW5jdGlvbih0KXt2YXIgZSxpLG89dC5sZW5ndGgsYT0wLHM9TC5MYXRMbmcuREVHX1RPX1JBRDtpZihvPjIpe2Zvcih2YXIgcj0wO28+cjtyKyspZT10W3JdLGk9dFsocisxKSVvXSxhKz0oaS5sbmctZS5sbmcpKnMqKDIrTWF0aC5zaW4oZS5sYXQqcykrTWF0aC5zaW4oaS5sYXQqcykpO2E9NjM3ODEzNyphKjYzNzgxMzcvMn1yZXR1cm4gTWF0aC5hYnMoYSl9LHJlYWRhYmxlQXJlYTpmdW5jdGlvbih0LGUpe3ZhciBpO3JldHVybiBlP2k9dD49MWU0PygxZS00KnQpLnRvRml4ZWQoMikrXCIgaGFcIjp0LnRvRml4ZWQoMikrXCIgbSZzdXAyO1wiOih0Kj0uODM2MTI3LGk9dD49MzA5NzYwMD8odC8zMDk3NjAwKS50b0ZpeGVkKDIpK1wiIG1pJnN1cDI7XCI6dD49NDg0MD8odC80ODQwKS50b0ZpeGVkKDIpK1wiIGFjcmVzXCI6TWF0aC5jZWlsKHQpK1wiIHlkJnN1cDI7XCIpLGl9LHJlYWRhYmxlRGlzdGFuY2U6ZnVuY3Rpb24odCxlKXt2YXIgaTtyZXR1cm4gZT9pPXQ+MWUzPyh0LzFlMykudG9GaXhlZCgyKStcIiBrbVwiOk1hdGguY2VpbCh0KStcIiBtXCI6KHQqPTEuMDkzNjEsaT10PjE3NjA/KHQvMTc2MCkudG9GaXhlZCgyKStcIiBtaWxlc1wiOk1hdGguY2VpbCh0KStcIiB5ZFwiKSxpfX0pLEwuVXRpbC5leHRlbmQoTC5MaW5lVXRpbCx7c2VnbWVudHNJbnRlcnNlY3Q6ZnVuY3Rpb24odCxlLGksbyl7cmV0dXJuIHRoaXMuX2NoZWNrQ291bnRlcmNsb2Nrd2lzZSh0LGksbykhPT10aGlzLl9jaGVja0NvdW50ZXJjbG9ja3dpc2UoZSxpLG8pJiZ0aGlzLl9jaGVja0NvdW50ZXJjbG9ja3dpc2UodCxlLGkpIT09dGhpcy5fY2hlY2tDb3VudGVyY2xvY2t3aXNlKHQsZSxvKX0sX2NoZWNrQ291bnRlcmNsb2Nrd2lzZTpmdW5jdGlvbih0LGUsaSl7cmV0dXJuKGkueS10LnkpKihlLngtdC54KT4oZS55LXQueSkqKGkueC10LngpfX0pLEwuUG9seWxpbmUuaW5jbHVkZSh7aW50ZXJzZWN0czpmdW5jdGlvbigpe3ZhciB0LGUsaSxvPXRoaXMuX29yaWdpbmFsUG9pbnRzLGE9bz9vLmxlbmd0aDowO2lmKHRoaXMuX3Rvb0Zld1BvaW50c0ZvckludGVyc2VjdGlvbigpKXJldHVybiExO2Zvcih0PWEtMTt0Pj0zO3QtLSlpZihlPW9bdC0xXSxpPW9bdF0sdGhpcy5fbGluZVNlZ21lbnRzSW50ZXJzZWN0c1JhbmdlKGUsaSx0LTIpKXJldHVybiEwO3JldHVybiExfSxuZXdMYXRMbmdJbnRlcnNlY3RzOmZ1bmN0aW9uKHQsZSl7cmV0dXJuIHRoaXMuX21hcD90aGlzLm5ld1BvaW50SW50ZXJzZWN0cyh0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KHQpLGUpOiExfSxuZXdQb2ludEludGVyc2VjdHM6ZnVuY3Rpb24odCxlKXt2YXIgaT10aGlzLl9vcmlnaW5hbFBvaW50cyxvPWk/aS5sZW5ndGg6MCxhPWk/aVtvLTFdOm51bGwscz1vLTI7cmV0dXJuIHRoaXMuX3Rvb0Zld1BvaW50c0ZvckludGVyc2VjdGlvbigxKT8hMTp0aGlzLl9saW5lU2VnbWVudHNJbnRlcnNlY3RzUmFuZ2UoYSx0LHMsZT8xOjApfSxfdG9vRmV3UG9pbnRzRm9ySW50ZXJzZWN0aW9uOmZ1bmN0aW9uKHQpe3ZhciBlPXRoaXMuX29yaWdpbmFsUG9pbnRzLGk9ZT9lLmxlbmd0aDowO3JldHVybiBpKz10fHwwLCF0aGlzLl9vcmlnaW5hbFBvaW50c3x8Mz49aX0sX2xpbmVTZWdtZW50c0ludGVyc2VjdHNSYW5nZTpmdW5jdGlvbih0LGUsaSxvKXt2YXIgYSxzLHI9dGhpcy5fb3JpZ2luYWxQb2ludHM7bz1vfHwwO2Zvcih2YXIgbj1pO24+bztuLS0paWYoYT1yW24tMV0scz1yW25dLEwuTGluZVV0aWwuc2VnbWVudHNJbnRlcnNlY3QodCxlLGEscykpcmV0dXJuITA7cmV0dXJuITF9fSksTC5Qb2x5Z29uLmluY2x1ZGUoe2ludGVyc2VjdHM6ZnVuY3Rpb24oKXt2YXIgdCxlLGksbyxhLHM9dGhpcy5fb3JpZ2luYWxQb2ludHM7cmV0dXJuIHRoaXMuX3Rvb0Zld1BvaW50c0ZvckludGVyc2VjdGlvbigpPyExOih0PUwuUG9seWxpbmUucHJvdG90eXBlLmludGVyc2VjdHMuY2FsbCh0aGlzKSk/ITA6KGU9cy5sZW5ndGgsaT1zWzBdLG89c1tlLTFdLGE9ZS0yLHRoaXMuX2xpbmVTZWdtZW50c0ludGVyc2VjdHNSYW5nZShvLGksYSwxKSl9fSksTC5Db250cm9sLkRyYXc9TC5Db250cm9sLmV4dGVuZCh7b3B0aW9uczp7cG9zaXRpb246XCJ0b3BsZWZ0XCIsZHJhdzp7fSxlZGl0OiExfSxpbml0aWFsaXplOmZ1bmN0aW9uKHQpe2lmKEwudmVyc2lvbjxcIjAuN1wiKXRocm93IG5ldyBFcnJvcihcIkxlYWZsZXQuZHJhdyAwLjIuMysgcmVxdWlyZXMgTGVhZmxldCAwLjcuMCsuIERvd25sb2FkIGxhdGVzdCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9MZWFmbGV0L0xlYWZsZXQvXCIpO0wuQ29udHJvbC5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsdCk7dmFyIGUsaTt0aGlzLl90b29sYmFycz17fSxMLkRyYXdUb29sYmFyJiZ0aGlzLm9wdGlvbnMuZHJhdyYmKGk9bmV3IEwuRHJhd1Rvb2xiYXIodGhpcy5vcHRpb25zLmRyYXcpLGU9TC5zdGFtcChpKSx0aGlzLl90b29sYmFyc1tlXT1pLHRoaXMuX3Rvb2xiYXJzW2VdLm9uKFwiZW5hYmxlXCIsdGhpcy5fdG9vbGJhckVuYWJsZWQsdGhpcykpLEwuRWRpdFRvb2xiYXImJnRoaXMub3B0aW9ucy5lZGl0JiYoaT1uZXcgTC5FZGl0VG9vbGJhcih0aGlzLm9wdGlvbnMuZWRpdCksZT1MLnN0YW1wKGkpLHRoaXMuX3Rvb2xiYXJzW2VdPWksdGhpcy5fdG9vbGJhcnNbZV0ub24oXCJlbmFibGVcIix0aGlzLl90b29sYmFyRW5hYmxlZCx0aGlzKSl9LG9uQWRkOmZ1bmN0aW9uKHQpe3ZhciBlLGk9TC5Eb21VdGlsLmNyZWF0ZShcImRpdlwiLFwibGVhZmxldC1kcmF3XCIpLG89ITEsYT1cImxlYWZsZXQtZHJhdy10b29sYmFyLXRvcFwiO2Zvcih2YXIgcyBpbiB0aGlzLl90b29sYmFycyl0aGlzLl90b29sYmFycy5oYXNPd25Qcm9wZXJ0eShzKSYmKGU9dGhpcy5fdG9vbGJhcnNbc10uYWRkVG9vbGJhcih0KSxlJiYob3x8KEwuRG9tVXRpbC5oYXNDbGFzcyhlLGEpfHxMLkRvbVV0aWwuYWRkQ2xhc3MoZS5jaGlsZE5vZGVzWzBdLGEpLG89ITApLGkuYXBwZW5kQ2hpbGQoZSkpKTtyZXR1cm4gaX0sb25SZW1vdmU6ZnVuY3Rpb24oKXtmb3IodmFyIHQgaW4gdGhpcy5fdG9vbGJhcnMpdGhpcy5fdG9vbGJhcnMuaGFzT3duUHJvcGVydHkodCkmJnRoaXMuX3Rvb2xiYXJzW3RdLnJlbW92ZVRvb2xiYXIoKX0sc2V0RHJhd2luZ09wdGlvbnM6ZnVuY3Rpb24odCl7Zm9yKHZhciBlIGluIHRoaXMuX3Rvb2xiYXJzKXRoaXMuX3Rvb2xiYXJzW2VdaW5zdGFuY2VvZiBMLkRyYXdUb29sYmFyJiZ0aGlzLl90b29sYmFyc1tlXS5zZXRPcHRpb25zKHQpfSxfdG9vbGJhckVuYWJsZWQ6ZnVuY3Rpb24odCl7dmFyIGU9XCJcIitMLnN0YW1wKHQudGFyZ2V0KTtmb3IodmFyIGkgaW4gdGhpcy5fdG9vbGJhcnMpdGhpcy5fdG9vbGJhcnMuaGFzT3duUHJvcGVydHkoaSkmJmkhPT1lJiZ0aGlzLl90b29sYmFyc1tpXS5kaXNhYmxlKCl9fSksTC5NYXAubWVyZ2VPcHRpb25zKHtkcmF3Q29udHJvbFRvb2x0aXBzOiEwLGRyYXdDb250cm9sOiExfSksTC5NYXAuYWRkSW5pdEhvb2soZnVuY3Rpb24oKXt0aGlzLm9wdGlvbnMuZHJhd0NvbnRyb2wmJih0aGlzLmRyYXdDb250cm9sPW5ldyBMLkNvbnRyb2wuRHJhdyx0aGlzLmFkZENvbnRyb2wodGhpcy5kcmF3Q29udHJvbCkpfSksTC5Ub29sYmFyPUwuQ2xhc3MuZXh0ZW5kKHtpbmNsdWRlczpbTC5NaXhpbi5FdmVudHNdLGluaXRpYWxpemU6ZnVuY3Rpb24odCl7TC5zZXRPcHRpb25zKHRoaXMsdCksdGhpcy5fbW9kZXM9e30sdGhpcy5fYWN0aW9uQnV0dG9ucz1bXSx0aGlzLl9hY3RpdmVNb2RlPW51bGx9LGVuYWJsZWQ6ZnVuY3Rpb24oKXtyZXR1cm4gbnVsbCE9PXRoaXMuX2FjdGl2ZU1vZGV9LGRpc2FibGU6ZnVuY3Rpb24oKXt0aGlzLmVuYWJsZWQoKSYmdGhpcy5fYWN0aXZlTW9kZS5oYW5kbGVyLmRpc2FibGUoKX0sYWRkVG9vbGJhcjpmdW5jdGlvbih0KXt2YXIgZSxpPUwuRG9tVXRpbC5jcmVhdGUoXCJkaXZcIixcImxlYWZsZXQtZHJhdy1zZWN0aW9uXCIpLG89MCxhPXRoaXMuX3Rvb2xiYXJDbGFzc3x8XCJcIixzPXRoaXMuZ2V0TW9kZUhhbmRsZXJzKHQpO2Zvcih0aGlzLl90b29sYmFyQ29udGFpbmVyPUwuRG9tVXRpbC5jcmVhdGUoXCJkaXZcIixcImxlYWZsZXQtZHJhdy10b29sYmFyIGxlYWZsZXQtYmFyXCIpLHRoaXMuX21hcD10LGU9MDtlPHMubGVuZ3RoO2UrKylzW2VdLmVuYWJsZWQmJnRoaXMuX2luaXRNb2RlSGFuZGxlcihzW2VdLmhhbmRsZXIsdGhpcy5fdG9vbGJhckNvbnRhaW5lcixvKyssYSxzW2VdLnRpdGxlKTtyZXR1cm4gbz8odGhpcy5fbGFzdEJ1dHRvbkluZGV4PS0tbyx0aGlzLl9hY3Rpb25zQ29udGFpbmVyPUwuRG9tVXRpbC5jcmVhdGUoXCJ1bFwiLFwibGVhZmxldC1kcmF3LWFjdGlvbnNcIiksaS5hcHBlbmRDaGlsZCh0aGlzLl90b29sYmFyQ29udGFpbmVyKSxpLmFwcGVuZENoaWxkKHRoaXMuX2FjdGlvbnNDb250YWluZXIpLGkpOnZvaWQgMH0scmVtb3ZlVG9vbGJhcjpmdW5jdGlvbigpe2Zvcih2YXIgdCBpbiB0aGlzLl9tb2Rlcyl0aGlzLl9tb2Rlcy5oYXNPd25Qcm9wZXJ0eSh0KSYmKHRoaXMuX2Rpc3Bvc2VCdXR0b24odGhpcy5fbW9kZXNbdF0uYnV0dG9uLHRoaXMuX21vZGVzW3RdLmhhbmRsZXIuZW5hYmxlLHRoaXMuX21vZGVzW3RdLmhhbmRsZXIpLHRoaXMuX21vZGVzW3RdLmhhbmRsZXIuZGlzYWJsZSgpLHRoaXMuX21vZGVzW3RdLmhhbmRsZXIub2ZmKFwiZW5hYmxlZFwiLHRoaXMuX2hhbmRsZXJBY3RpdmF0ZWQsdGhpcykub2ZmKFwiZGlzYWJsZWRcIix0aGlzLl9oYW5kbGVyRGVhY3RpdmF0ZWQsdGhpcykpO3RoaXMuX21vZGVzPXt9O2Zvcih2YXIgZT0wLGk9dGhpcy5fYWN0aW9uQnV0dG9ucy5sZW5ndGg7aT5lO2UrKyl0aGlzLl9kaXNwb3NlQnV0dG9uKHRoaXMuX2FjdGlvbkJ1dHRvbnNbZV0uYnV0dG9uLHRoaXMuX2FjdGlvbkJ1dHRvbnNbZV0uY2FsbGJhY2ssdGhpcyk7dGhpcy5fYWN0aW9uQnV0dG9ucz1bXSx0aGlzLl9hY3Rpb25zQ29udGFpbmVyPW51bGx9LF9pbml0TW9kZUhhbmRsZXI6ZnVuY3Rpb24odCxlLGksbyxhKXt2YXIgcz10LnR5cGU7dGhpcy5fbW9kZXNbc109e30sdGhpcy5fbW9kZXNbc10uaGFuZGxlcj10LHRoaXMuX21vZGVzW3NdLmJ1dHRvbj10aGlzLl9jcmVhdGVCdXR0b24oe3RpdGxlOmEsY2xhc3NOYW1lOm8rXCItXCIrcyxjb250YWluZXI6ZSxjYWxsYmFjazp0aGlzLl9tb2Rlc1tzXS5oYW5kbGVyLmVuYWJsZSxjb250ZXh0OnRoaXMuX21vZGVzW3NdLmhhbmRsZXJ9KSx0aGlzLl9tb2Rlc1tzXS5idXR0b25JbmRleD1pLHRoaXMuX21vZGVzW3NdLmhhbmRsZXIub24oXCJlbmFibGVkXCIsdGhpcy5faGFuZGxlckFjdGl2YXRlZCx0aGlzKS5vbihcImRpc2FibGVkXCIsdGhpcy5faGFuZGxlckRlYWN0aXZhdGVkLHRoaXMpfSxfY3JlYXRlQnV0dG9uOmZ1bmN0aW9uKHQpe3ZhciBlPUwuRG9tVXRpbC5jcmVhdGUoXCJhXCIsdC5jbGFzc05hbWV8fFwiXCIsdC5jb250YWluZXIpO3JldHVybiBlLmhyZWY9XCIjXCIsdC50ZXh0JiYoZS5pbm5lckhUTUw9dC50ZXh0KSx0LnRpdGxlJiYoZS50aXRsZT10LnRpdGxlKSxMLkRvbUV2ZW50Lm9uKGUsXCJjbGlja1wiLEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKS5vbihlLFwibW91c2Vkb3duXCIsTC5Eb21FdmVudC5zdG9wUHJvcGFnYXRpb24pLm9uKGUsXCJkYmxjbGlja1wiLEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKS5vbihlLFwiY2xpY2tcIixMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KS5vbihlLFwiY2xpY2tcIix0LmNhbGxiYWNrLHQuY29udGV4dCksZX0sX2Rpc3Bvc2VCdXR0b246ZnVuY3Rpb24odCxlKXtMLkRvbUV2ZW50Lm9mZih0LFwiY2xpY2tcIixMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbikub2ZmKHQsXCJtb3VzZWRvd25cIixMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbikub2ZmKHQsXCJkYmxjbGlja1wiLEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKS5vZmYodCxcImNsaWNrXCIsTC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdCkub2ZmKHQsXCJjbGlja1wiLGUpfSxfaGFuZGxlckFjdGl2YXRlZDpmdW5jdGlvbih0KXt0aGlzLmRpc2FibGUoKSx0aGlzLl9hY3RpdmVNb2RlPXRoaXMuX21vZGVzW3QuaGFuZGxlcl0sTC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2FjdGl2ZU1vZGUuYnV0dG9uLFwibGVhZmxldC1kcmF3LXRvb2xiYXItYnV0dG9uLWVuYWJsZWRcIiksdGhpcy5fc2hvd0FjdGlvbnNUb29sYmFyKCksdGhpcy5maXJlKFwiZW5hYmxlXCIpfSxfaGFuZGxlckRlYWN0aXZhdGVkOmZ1bmN0aW9uKCl7dGhpcy5faGlkZUFjdGlvbnNUb29sYmFyKCksTC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX2FjdGl2ZU1vZGUuYnV0dG9uLFwibGVhZmxldC1kcmF3LXRvb2xiYXItYnV0dG9uLWVuYWJsZWRcIiksdGhpcy5fYWN0aXZlTW9kZT1udWxsLHRoaXMuZmlyZShcImRpc2FibGVcIil9LF9jcmVhdGVBY3Rpb25zOmZ1bmN0aW9uKHQpe3ZhciBlLGksbyxhLHM9dGhpcy5fYWN0aW9uc0NvbnRhaW5lcixyPXRoaXMuZ2V0QWN0aW9ucyh0KSxuPXIubGVuZ3RoO2ZvcihpPTAsbz10aGlzLl9hY3Rpb25CdXR0b25zLmxlbmd0aDtvPmk7aSsrKXRoaXMuX2Rpc3Bvc2VCdXR0b24odGhpcy5fYWN0aW9uQnV0dG9uc1tpXS5idXR0b24sdGhpcy5fYWN0aW9uQnV0dG9uc1tpXS5jYWxsYmFjayk7Zm9yKHRoaXMuX2FjdGlvbkJ1dHRvbnM9W107cy5maXJzdENoaWxkOylzLnJlbW92ZUNoaWxkKHMuZmlyc3RDaGlsZCk7Zm9yKHZhciBsPTA7bj5sO2wrKylcImVuYWJsZWRcImluIHJbbF0mJiFyW2xdLmVuYWJsZWR8fChlPUwuRG9tVXRpbC5jcmVhdGUoXCJsaVwiLFwiXCIscyksYT10aGlzLl9jcmVhdGVCdXR0b24oe3RpdGxlOnJbbF0udGl0bGUsdGV4dDpyW2xdLnRleHQsY29udGFpbmVyOmUsY2FsbGJhY2s6cltsXS5jYWxsYmFjayxjb250ZXh0OnJbbF0uY29udGV4dH0pLHRoaXMuX2FjdGlvbkJ1dHRvbnMucHVzaCh7YnV0dG9uOmEsY2FsbGJhY2s6cltsXS5jYWxsYmFja30pKX0sX3Nob3dBY3Rpb25zVG9vbGJhcjpmdW5jdGlvbigpe3ZhciB0PXRoaXMuX2FjdGl2ZU1vZGUuYnV0dG9uSW5kZXgsZT10aGlzLl9sYXN0QnV0dG9uSW5kZXgsaT10aGlzLl9hY3RpdmVNb2RlLmJ1dHRvbi5vZmZzZXRUb3AtMTt0aGlzLl9jcmVhdGVBY3Rpb25zKHRoaXMuX2FjdGl2ZU1vZGUuaGFuZGxlciksdGhpcy5fYWN0aW9uc0NvbnRhaW5lci5zdHlsZS50b3A9aStcInB4XCIsMD09PXQmJihMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fdG9vbGJhckNvbnRhaW5lcixcImxlYWZsZXQtZHJhdy10b29sYmFyLW5vdG9wXCIpLEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9hY3Rpb25zQ29udGFpbmVyLFwibGVhZmxldC1kcmF3LWFjdGlvbnMtdG9wXCIpKSx0PT09ZSYmKEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl90b29sYmFyQ29udGFpbmVyLFwibGVhZmxldC1kcmF3LXRvb2xiYXItbm9ib3R0b21cIiksTC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2FjdGlvbnNDb250YWluZXIsXCJsZWFmbGV0LWRyYXctYWN0aW9ucy1ib3R0b21cIikpLHRoaXMuX2FjdGlvbnNDb250YWluZXIuc3R5bGUuZGlzcGxheT1cImJsb2NrXCJcbn0sX2hpZGVBY3Rpb25zVG9vbGJhcjpmdW5jdGlvbigpe3RoaXMuX2FjdGlvbnNDb250YWluZXIuc3R5bGUuZGlzcGxheT1cIm5vbmVcIixMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fdG9vbGJhckNvbnRhaW5lcixcImxlYWZsZXQtZHJhdy10b29sYmFyLW5vdG9wXCIpLEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aGlzLl90b29sYmFyQ29udGFpbmVyLFwibGVhZmxldC1kcmF3LXRvb2xiYXItbm9ib3R0b21cIiksTC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX2FjdGlvbnNDb250YWluZXIsXCJsZWFmbGV0LWRyYXctYWN0aW9ucy10b3BcIiksTC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX2FjdGlvbnNDb250YWluZXIsXCJsZWFmbGV0LWRyYXctYWN0aW9ucy1ib3R0b21cIil9fSksTC5Ub29sdGlwPUwuQ2xhc3MuZXh0ZW5kKHtpbml0aWFsaXplOmZ1bmN0aW9uKHQpe3RoaXMuX21hcD10LHRoaXMuX3BvcHVwUGFuZT10Ll9wYW5lcy5wb3B1cFBhbmUsdGhpcy5fY29udGFpbmVyPXQub3B0aW9ucy5kcmF3Q29udHJvbFRvb2x0aXBzP0wuRG9tVXRpbC5jcmVhdGUoXCJkaXZcIixcImxlYWZsZXQtZHJhdy10b29sdGlwXCIsdGhpcy5fcG9wdXBQYW5lKTpudWxsLHRoaXMuX3NpbmdsZUxpbmVMYWJlbD0hMX0sZGlzcG9zZTpmdW5jdGlvbigpe3RoaXMuX2NvbnRhaW5lciYmKHRoaXMuX3BvcHVwUGFuZS5yZW1vdmVDaGlsZCh0aGlzLl9jb250YWluZXIpLHRoaXMuX2NvbnRhaW5lcj1udWxsKX0sdXBkYXRlQ29udGVudDpmdW5jdGlvbih0KXtyZXR1cm4gdGhpcy5fY29udGFpbmVyPyh0LnN1YnRleHQ9dC5zdWJ0ZXh0fHxcIlwiLDAhPT10LnN1YnRleHQubGVuZ3RofHx0aGlzLl9zaW5nbGVMaW5lTGFiZWw/dC5zdWJ0ZXh0Lmxlbmd0aD4wJiZ0aGlzLl9zaW5nbGVMaW5lTGFiZWwmJihMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fY29udGFpbmVyLFwibGVhZmxldC1kcmF3LXRvb2x0aXAtc2luZ2xlXCIpLHRoaXMuX3NpbmdsZUxpbmVMYWJlbD0hMSk6KEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9jb250YWluZXIsXCJsZWFmbGV0LWRyYXctdG9vbHRpcC1zaW5nbGVcIiksdGhpcy5fc2luZ2xlTGluZUxhYmVsPSEwKSx0aGlzLl9jb250YWluZXIuaW5uZXJIVE1MPSh0LnN1YnRleHQubGVuZ3RoPjA/JzxzcGFuIGNsYXNzPVwibGVhZmxldC1kcmF3LXRvb2x0aXAtc3VidGV4dFwiPicrdC5zdWJ0ZXh0K1wiPC9zcGFuPjxiciAvPlwiOlwiXCIpK1wiPHNwYW4+XCIrdC50ZXh0K1wiPC9zcGFuPlwiLHRoaXMpOnRoaXN9LHVwZGF0ZVBvc2l0aW9uOmZ1bmN0aW9uKHQpe3ZhciBlPXRoaXMuX21hcC5sYXRMbmdUb0xheWVyUG9pbnQodCksaT10aGlzLl9jb250YWluZXI7cmV0dXJuIHRoaXMuX2NvbnRhaW5lciYmKGkuc3R5bGUudmlzaWJpbGl0eT1cImluaGVyaXRcIixMLkRvbVV0aWwuc2V0UG9zaXRpb24oaSxlKSksdGhpc30sc2hvd0FzRXJyb3I6ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5fY29udGFpbmVyJiZMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fY29udGFpbmVyLFwibGVhZmxldC1lcnJvci1kcmF3LXRvb2x0aXBcIiksdGhpc30scmVtb3ZlRXJyb3I6ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5fY29udGFpbmVyJiZMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fY29udGFpbmVyLFwibGVhZmxldC1lcnJvci1kcmF3LXRvb2x0aXBcIiksdGhpc319KSxMLkRyYXdUb29sYmFyPUwuVG9vbGJhci5leHRlbmQoe29wdGlvbnM6e3BvbHlsaW5lOnt9LHBvbHlnb246e30scmVjdGFuZ2xlOnt9LGNpcmNsZTp7fSxtYXJrZXI6e319LGluaXRpYWxpemU6ZnVuY3Rpb24odCl7Zm9yKHZhciBlIGluIHRoaXMub3B0aW9ucyl0aGlzLm9wdGlvbnMuaGFzT3duUHJvcGVydHkoZSkmJnRbZV0mJih0W2VdPUwuZXh0ZW5kKHt9LHRoaXMub3B0aW9uc1tlXSx0W2VdKSk7dGhpcy5fdG9vbGJhckNsYXNzPVwibGVhZmxldC1kcmF3LWRyYXdcIixMLlRvb2xiYXIucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLHQpfSxnZXRNb2RlSGFuZGxlcnM6ZnVuY3Rpb24odCl7cmV0dXJuW3tlbmFibGVkOnRoaXMub3B0aW9ucy5wb2x5bGluZSxoYW5kbGVyOm5ldyBMLkRyYXcuUG9seWxpbmUodCx0aGlzLm9wdGlvbnMucG9seWxpbmUpLHRpdGxlOkwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5idXR0b25zLnBvbHlsaW5lfSx7ZW5hYmxlZDp0aGlzLm9wdGlvbnMucG9seWdvbixoYW5kbGVyOm5ldyBMLkRyYXcuUG9seWdvbih0LHRoaXMub3B0aW9ucy5wb2x5Z29uKSx0aXRsZTpMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuYnV0dG9ucy5wb2x5Z29ufSx7ZW5hYmxlZDp0aGlzLm9wdGlvbnMucmVjdGFuZ2xlLGhhbmRsZXI6bmV3IEwuRHJhdy5SZWN0YW5nbGUodCx0aGlzLm9wdGlvbnMucmVjdGFuZ2xlKSx0aXRsZTpMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuYnV0dG9ucy5yZWN0YW5nbGV9LHtlbmFibGVkOnRoaXMub3B0aW9ucy5jaXJjbGUsaGFuZGxlcjpuZXcgTC5EcmF3LkNpcmNsZSh0LHRoaXMub3B0aW9ucy5jaXJjbGUpLHRpdGxlOkwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5idXR0b25zLmNpcmNsZX0se2VuYWJsZWQ6dGhpcy5vcHRpb25zLm1hcmtlcixoYW5kbGVyOm5ldyBMLkRyYXcuTWFya2VyKHQsdGhpcy5vcHRpb25zLm1hcmtlciksdGl0bGU6TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmJ1dHRvbnMubWFya2VyfV19LGdldEFjdGlvbnM6ZnVuY3Rpb24odCl7cmV0dXJuW3tlbmFibGVkOnQuZGVsZXRlTGFzdFZlcnRleCx0aXRsZTpMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIudW5kby50aXRsZSx0ZXh0OkwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci51bmRvLnRleHQsY2FsbGJhY2s6dC5kZWxldGVMYXN0VmVydGV4LGNvbnRleHQ6dH0se3RpdGxlOkwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5hY3Rpb25zLnRpdGxlLHRleHQ6TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmFjdGlvbnMudGV4dCxjYWxsYmFjazp0aGlzLmRpc2FibGUsY29udGV4dDp0aGlzfV19LHNldE9wdGlvbnM6ZnVuY3Rpb24odCl7TC5zZXRPcHRpb25zKHRoaXMsdCk7Zm9yKHZhciBlIGluIHRoaXMuX21vZGVzKXRoaXMuX21vZGVzLmhhc093blByb3BlcnR5KGUpJiZ0Lmhhc093blByb3BlcnR5KGUpJiZ0aGlzLl9tb2Rlc1tlXS5oYW5kbGVyLnNldE9wdGlvbnModFtlXSl9fSksTC5FZGl0VG9vbGJhcj1MLlRvb2xiYXIuZXh0ZW5kKHtvcHRpb25zOntlZGl0OntzZWxlY3RlZFBhdGhPcHRpb25zOntjb2xvcjpcIiNmZTU3YTFcIixvcGFjaXR5Oi42LGRhc2hBcnJheTpcIjEwLCAxMFwiLGZpbGw6ITAsZmlsbENvbG9yOlwiI2ZlNTdhMVwiLGZpbGxPcGFjaXR5Oi4xfX0scmVtb3ZlOnt9LGZlYXR1cmVHcm91cDpudWxsfSxpbml0aWFsaXplOmZ1bmN0aW9uKHQpe3QuZWRpdCYmKFwidW5kZWZpbmVkXCI9PXR5cGVvZiB0LmVkaXQuc2VsZWN0ZWRQYXRoT3B0aW9ucyYmKHQuZWRpdC5zZWxlY3RlZFBhdGhPcHRpb25zPXRoaXMub3B0aW9ucy5lZGl0LnNlbGVjdGVkUGF0aE9wdGlvbnMpLHQuZWRpdD1MLmV4dGVuZCh7fSx0aGlzLm9wdGlvbnMuZWRpdCx0LmVkaXQpKSx0LnJlbW92ZSYmKHQucmVtb3ZlPUwuZXh0ZW5kKHt9LHRoaXMub3B0aW9ucy5yZW1vdmUsdC5yZW1vdmUpKSx0aGlzLl90b29sYmFyQ2xhc3M9XCJsZWFmbGV0LWRyYXctZWRpdFwiLEwuVG9vbGJhci5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsdCksdGhpcy5fc2VsZWN0ZWRGZWF0dXJlQ291bnQ9MH0sZ2V0TW9kZUhhbmRsZXJzOmZ1bmN0aW9uKHQpe3ZhciBlPXRoaXMub3B0aW9ucy5mZWF0dXJlR3JvdXA7cmV0dXJuW3tlbmFibGVkOnRoaXMub3B0aW9ucy5lZGl0LGhhbmRsZXI6bmV3IEwuRWRpdFRvb2xiYXIuRWRpdCh0LHtmZWF0dXJlR3JvdXA6ZSxzZWxlY3RlZFBhdGhPcHRpb25zOnRoaXMub3B0aW9ucy5lZGl0LnNlbGVjdGVkUGF0aE9wdGlvbnN9KSx0aXRsZTpMLmRyYXdMb2NhbC5lZGl0LnRvb2xiYXIuYnV0dG9ucy5lZGl0fSx7ZW5hYmxlZDp0aGlzLm9wdGlvbnMucmVtb3ZlLGhhbmRsZXI6bmV3IEwuRWRpdFRvb2xiYXIuRGVsZXRlKHQse2ZlYXR1cmVHcm91cDplfSksdGl0bGU6TC5kcmF3TG9jYWwuZWRpdC50b29sYmFyLmJ1dHRvbnMucmVtb3ZlfV19LGdldEFjdGlvbnM6ZnVuY3Rpb24oKXtyZXR1cm5be3RpdGxlOkwuZHJhd0xvY2FsLmVkaXQudG9vbGJhci5hY3Rpb25zLnNhdmUudGl0bGUsdGV4dDpMLmRyYXdMb2NhbC5lZGl0LnRvb2xiYXIuYWN0aW9ucy5zYXZlLnRleHQsY2FsbGJhY2s6dGhpcy5fc2F2ZSxjb250ZXh0OnRoaXN9LHt0aXRsZTpMLmRyYXdMb2NhbC5lZGl0LnRvb2xiYXIuYWN0aW9ucy5jYW5jZWwudGl0bGUsdGV4dDpMLmRyYXdMb2NhbC5lZGl0LnRvb2xiYXIuYWN0aW9ucy5jYW5jZWwudGV4dCxjYWxsYmFjazp0aGlzLmRpc2FibGUsY29udGV4dDp0aGlzfV19LGFkZFRvb2xiYXI6ZnVuY3Rpb24odCl7dmFyIGU9TC5Ub29sYmFyLnByb3RvdHlwZS5hZGRUb29sYmFyLmNhbGwodGhpcyx0KTtyZXR1cm4gdGhpcy5fY2hlY2tEaXNhYmxlZCgpLHRoaXMub3B0aW9ucy5mZWF0dXJlR3JvdXAub24oXCJsYXllcmFkZCBsYXllcnJlbW92ZVwiLHRoaXMuX2NoZWNrRGlzYWJsZWQsdGhpcyksZX0scmVtb3ZlVG9vbGJhcjpmdW5jdGlvbigpe3RoaXMub3B0aW9ucy5mZWF0dXJlR3JvdXAub2ZmKFwibGF5ZXJhZGQgbGF5ZXJyZW1vdmVcIix0aGlzLl9jaGVja0Rpc2FibGVkLHRoaXMpLEwuVG9vbGJhci5wcm90b3R5cGUucmVtb3ZlVG9vbGJhci5jYWxsKHRoaXMpfSxkaXNhYmxlOmZ1bmN0aW9uKCl7dGhpcy5lbmFibGVkKCkmJih0aGlzLl9hY3RpdmVNb2RlLmhhbmRsZXIucmV2ZXJ0TGF5ZXJzKCksTC5Ub29sYmFyLnByb3RvdHlwZS5kaXNhYmxlLmNhbGwodGhpcykpfSxfc2F2ZTpmdW5jdGlvbigpe3RoaXMuX2FjdGl2ZU1vZGUuaGFuZGxlci5zYXZlKCksdGhpcy5fYWN0aXZlTW9kZS5oYW5kbGVyLmRpc2FibGUoKX0sX2NoZWNrRGlzYWJsZWQ6ZnVuY3Rpb24oKXt2YXIgdCxlPXRoaXMub3B0aW9ucy5mZWF0dXJlR3JvdXAsaT0wIT09ZS5nZXRMYXllcnMoKS5sZW5ndGg7dGhpcy5vcHRpb25zLmVkaXQmJih0PXRoaXMuX21vZGVzW0wuRWRpdFRvb2xiYXIuRWRpdC5UWVBFXS5idXR0b24saT9MLkRvbVV0aWwucmVtb3ZlQ2xhc3ModCxcImxlYWZsZXQtZGlzYWJsZWRcIik6TC5Eb21VdGlsLmFkZENsYXNzKHQsXCJsZWFmbGV0LWRpc2FibGVkXCIpLHQuc2V0QXR0cmlidXRlKFwidGl0bGVcIixpP0wuZHJhd0xvY2FsLmVkaXQudG9vbGJhci5idXR0b25zLmVkaXQ6TC5kcmF3TG9jYWwuZWRpdC50b29sYmFyLmJ1dHRvbnMuZWRpdERpc2FibGVkKSksdGhpcy5vcHRpb25zLnJlbW92ZSYmKHQ9dGhpcy5fbW9kZXNbTC5FZGl0VG9vbGJhci5EZWxldGUuVFlQRV0uYnV0dG9uLGk/TC5Eb21VdGlsLnJlbW92ZUNsYXNzKHQsXCJsZWFmbGV0LWRpc2FibGVkXCIpOkwuRG9tVXRpbC5hZGRDbGFzcyh0LFwibGVhZmxldC1kaXNhYmxlZFwiKSx0LnNldEF0dHJpYnV0ZShcInRpdGxlXCIsaT9MLmRyYXdMb2NhbC5lZGl0LnRvb2xiYXIuYnV0dG9ucy5yZW1vdmU6TC5kcmF3TG9jYWwuZWRpdC50b29sYmFyLmJ1dHRvbnMucmVtb3ZlRGlzYWJsZWQpKX19KSxMLkVkaXRUb29sYmFyLkVkaXQ9TC5IYW5kbGVyLmV4dGVuZCh7c3RhdGljczp7VFlQRTpcImVkaXRcIn0saW5jbHVkZXM6TC5NaXhpbi5FdmVudHMsaW5pdGlhbGl6ZTpmdW5jdGlvbih0LGUpe2lmKEwuSGFuZGxlci5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsdCksdGhpcy5fc2VsZWN0ZWRQYXRoT3B0aW9ucz1lLnNlbGVjdGVkUGF0aE9wdGlvbnMsdGhpcy5fZmVhdHVyZUdyb3VwPWUuZmVhdHVyZUdyb3VwLCEodGhpcy5fZmVhdHVyZUdyb3VwIGluc3RhbmNlb2YgTC5GZWF0dXJlR3JvdXApKXRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMuZmVhdHVyZUdyb3VwIG11c3QgYmUgYSBMLkZlYXR1cmVHcm91cFwiKTt0aGlzLl91bmVkaXRlZExheWVyUHJvcHM9e30sdGhpcy50eXBlPUwuRWRpdFRvb2xiYXIuRWRpdC5UWVBFfSxlbmFibGU6ZnVuY3Rpb24oKXshdGhpcy5fZW5hYmxlZCYmdGhpcy5faGFzQXZhaWxhYmxlTGF5ZXJzKCkmJih0aGlzLmZpcmUoXCJlbmFibGVkXCIse2hhbmRsZXI6dGhpcy50eXBlfSksdGhpcy5fbWFwLmZpcmUoXCJkcmF3OmVkaXRzdGFydFwiLHtoYW5kbGVyOnRoaXMudHlwZX0pLEwuSGFuZGxlci5wcm90b3R5cGUuZW5hYmxlLmNhbGwodGhpcyksdGhpcy5fZmVhdHVyZUdyb3VwLm9uKFwibGF5ZXJhZGRcIix0aGlzLl9lbmFibGVMYXllckVkaXQsdGhpcykub24oXCJsYXllcnJlbW92ZVwiLHRoaXMuX2Rpc2FibGVMYXllckVkaXQsdGhpcykpfSxkaXNhYmxlOmZ1bmN0aW9uKCl7dGhpcy5fZW5hYmxlZCYmKHRoaXMuX2ZlYXR1cmVHcm91cC5vZmYoXCJsYXllcmFkZFwiLHRoaXMuX2VuYWJsZUxheWVyRWRpdCx0aGlzKS5vZmYoXCJsYXllcnJlbW92ZVwiLHRoaXMuX2Rpc2FibGVMYXllckVkaXQsdGhpcyksTC5IYW5kbGVyLnByb3RvdHlwZS5kaXNhYmxlLmNhbGwodGhpcyksdGhpcy5fbWFwLmZpcmUoXCJkcmF3OmVkaXRzdG9wXCIse2hhbmRsZXI6dGhpcy50eXBlfSksdGhpcy5maXJlKFwiZGlzYWJsZWRcIix7aGFuZGxlcjp0aGlzLnR5cGV9KSl9LGFkZEhvb2tzOmZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5fbWFwO3QmJih0LmdldENvbnRhaW5lcigpLmZvY3VzKCksdGhpcy5fZmVhdHVyZUdyb3VwLmVhY2hMYXllcih0aGlzLl9lbmFibGVMYXllckVkaXQsdGhpcyksdGhpcy5fdG9vbHRpcD1uZXcgTC5Ub29sdGlwKHRoaXMuX21hcCksdGhpcy5fdG9vbHRpcC51cGRhdGVDb250ZW50KHt0ZXh0OkwuZHJhd0xvY2FsLmVkaXQuaGFuZGxlcnMuZWRpdC50b29sdGlwLnRleHQsc3VidGV4dDpMLmRyYXdMb2NhbC5lZGl0LmhhbmRsZXJzLmVkaXQudG9vbHRpcC5zdWJ0ZXh0fSksdGhpcy5fbWFwLm9uKFwibW91c2Vtb3ZlXCIsdGhpcy5fb25Nb3VzZU1vdmUsdGhpcykpfSxyZW1vdmVIb29rczpmdW5jdGlvbigpe3RoaXMuX21hcCYmKHRoaXMuX2ZlYXR1cmVHcm91cC5lYWNoTGF5ZXIodGhpcy5fZGlzYWJsZUxheWVyRWRpdCx0aGlzKSx0aGlzLl91bmVkaXRlZExheWVyUHJvcHM9e30sdGhpcy5fdG9vbHRpcC5kaXNwb3NlKCksdGhpcy5fdG9vbHRpcD1udWxsLHRoaXMuX21hcC5vZmYoXCJtb3VzZW1vdmVcIix0aGlzLl9vbk1vdXNlTW92ZSx0aGlzKSl9LHJldmVydExheWVyczpmdW5jdGlvbigpe3RoaXMuX2ZlYXR1cmVHcm91cC5lYWNoTGF5ZXIoZnVuY3Rpb24odCl7dGhpcy5fcmV2ZXJ0TGF5ZXIodCl9LHRoaXMpfSxzYXZlOmZ1bmN0aW9uKCl7dmFyIHQ9bmV3IEwuTGF5ZXJHcm91cDt0aGlzLl9mZWF0dXJlR3JvdXAuZWFjaExheWVyKGZ1bmN0aW9uKGUpe2UuZWRpdGVkJiYodC5hZGRMYXllcihlKSxlLmVkaXRlZD0hMSl9KSx0aGlzLl9tYXAuZmlyZShcImRyYXc6ZWRpdGVkXCIse2xheWVyczp0fSl9LF9iYWNrdXBMYXllcjpmdW5jdGlvbih0KXt2YXIgZT1MLlV0aWwuc3RhbXAodCk7dGhpcy5fdW5lZGl0ZWRMYXllclByb3BzW2VdfHwodCBpbnN0YW5jZW9mIEwuUG9seWxpbmV8fHQgaW5zdGFuY2VvZiBMLlBvbHlnb258fHQgaW5zdGFuY2VvZiBMLlJlY3RhbmdsZT90aGlzLl91bmVkaXRlZExheWVyUHJvcHNbZV09e2xhdGxuZ3M6TC5MYXRMbmdVdGlsLmNsb25lTGF0TG5ncyh0LmdldExhdExuZ3MoKSl9OnQgaW5zdGFuY2VvZiBMLkNpcmNsZT90aGlzLl91bmVkaXRlZExheWVyUHJvcHNbZV09e2xhdGxuZzpMLkxhdExuZ1V0aWwuY2xvbmVMYXRMbmcodC5nZXRMYXRMbmcoKSkscmFkaXVzOnQuZ2V0UmFkaXVzKCl9OnQgaW5zdGFuY2VvZiBMLk1hcmtlciYmKHRoaXMuX3VuZWRpdGVkTGF5ZXJQcm9wc1tlXT17bGF0bG5nOkwuTGF0TG5nVXRpbC5jbG9uZUxhdExuZyh0LmdldExhdExuZygpKX0pKX0sX3JldmVydExheWVyOmZ1bmN0aW9uKHQpe3ZhciBlPUwuVXRpbC5zdGFtcCh0KTt0LmVkaXRlZD0hMSx0aGlzLl91bmVkaXRlZExheWVyUHJvcHMuaGFzT3duUHJvcGVydHkoZSkmJih0IGluc3RhbmNlb2YgTC5Qb2x5bGluZXx8dCBpbnN0YW5jZW9mIEwuUG9seWdvbnx8dCBpbnN0YW5jZW9mIEwuUmVjdGFuZ2xlP3Quc2V0TGF0TG5ncyh0aGlzLl91bmVkaXRlZExheWVyUHJvcHNbZV0ubGF0bG5ncyk6dCBpbnN0YW5jZW9mIEwuQ2lyY2xlPyh0LnNldExhdExuZyh0aGlzLl91bmVkaXRlZExheWVyUHJvcHNbZV0ubGF0bG5nKSx0LnNldFJhZGl1cyh0aGlzLl91bmVkaXRlZExheWVyUHJvcHNbZV0ucmFkaXVzKSk6dCBpbnN0YW5jZW9mIEwuTWFya2VyJiZ0LnNldExhdExuZyh0aGlzLl91bmVkaXRlZExheWVyUHJvcHNbZV0ubGF0bG5nKSl9LF90b2dnbGVNYXJrZXJIaWdobGlnaHQ6ZnVuY3Rpb24odCl7aWYodC5faWNvbil7dmFyIGU9dC5faWNvbjtlLnN0eWxlLmRpc3BsYXk9XCJub25lXCIsTC5Eb21VdGlsLmhhc0NsYXNzKGUsXCJsZWFmbGV0LWVkaXQtbWFya2VyLXNlbGVjdGVkXCIpPyhMLkRvbVV0aWwucmVtb3ZlQ2xhc3MoZSxcImxlYWZsZXQtZWRpdC1tYXJrZXItc2VsZWN0ZWRcIiksdGhpcy5fb2Zmc2V0TWFya2VyKGUsLTQpKTooTC5Eb21VdGlsLmFkZENsYXNzKGUsXCJsZWFmbGV0LWVkaXQtbWFya2VyLXNlbGVjdGVkXCIpLHRoaXMuX29mZnNldE1hcmtlcihlLDQpKSxlLnN0eWxlLmRpc3BsYXk9XCJcIn19LF9vZmZzZXRNYXJrZXI6ZnVuY3Rpb24odCxlKXt2YXIgaT1wYXJzZUludCh0LnN0eWxlLm1hcmdpblRvcCwxMCktZSxvPXBhcnNlSW50KHQuc3R5bGUubWFyZ2luTGVmdCwxMCktZTt0LnN0eWxlLm1hcmdpblRvcD1pK1wicHhcIix0LnN0eWxlLm1hcmdpbkxlZnQ9bytcInB4XCJ9LF9lbmFibGVMYXllckVkaXQ6ZnVuY3Rpb24odCl7dmFyIGUsaT10LmxheWVyfHx0LnRhcmdldHx8dCxvPWkgaW5zdGFuY2VvZiBMLk1hcmtlcjsoIW98fGkuX2ljb24pJiYodGhpcy5fYmFja3VwTGF5ZXIoaSksdGhpcy5fc2VsZWN0ZWRQYXRoT3B0aW9ucyYmKGU9TC5VdGlsLmV4dGVuZCh7fSx0aGlzLl9zZWxlY3RlZFBhdGhPcHRpb25zKSxvP3RoaXMuX3RvZ2dsZU1hcmtlckhpZ2hsaWdodChpKTooaS5vcHRpb25zLnByZXZpb3VzT3B0aW9ucz1MLlV0aWwuZXh0ZW5kKHtkYXNoQXJyYXk6bnVsbH0saS5vcHRpb25zKSxpIGluc3RhbmNlb2YgTC5DaXJjbGV8fGkgaW5zdGFuY2VvZiBMLlBvbHlnb258fGkgaW5zdGFuY2VvZiBMLlJlY3RhbmdsZXx8KGUuZmlsbD0hMSksaS5zZXRTdHlsZShlKSkpLG8/KGkuZHJhZ2dpbmcuZW5hYmxlKCksaS5vbihcImRyYWdlbmRcIix0aGlzLl9vbk1hcmtlckRyYWdFbmQpKTppLmVkaXRpbmcuZW5hYmxlKCkpfSxfZGlzYWJsZUxheWVyRWRpdDpmdW5jdGlvbih0KXt2YXIgZT10LmxheWVyfHx0LnRhcmdldHx8dDtlLmVkaXRlZD0hMSx0aGlzLl9zZWxlY3RlZFBhdGhPcHRpb25zJiYoZSBpbnN0YW5jZW9mIEwuTWFya2VyP3RoaXMuX3RvZ2dsZU1hcmtlckhpZ2hsaWdodChlKTooZS5zZXRTdHlsZShlLm9wdGlvbnMucHJldmlvdXNPcHRpb25zKSxkZWxldGUgZS5vcHRpb25zLnByZXZpb3VzT3B0aW9ucykpLGUgaW5zdGFuY2VvZiBMLk1hcmtlcj8oZS5kcmFnZ2luZy5kaXNhYmxlKCksZS5vZmYoXCJkcmFnZW5kXCIsdGhpcy5fb25NYXJrZXJEcmFnRW5kLHRoaXMpKTplLmVkaXRpbmcuZGlzYWJsZSgpfSxfb25NYXJrZXJEcmFnRW5kOmZ1bmN0aW9uKHQpe3ZhciBlPXQudGFyZ2V0O2UuZWRpdGVkPSEwfSxfb25Nb3VzZU1vdmU6ZnVuY3Rpb24odCl7dGhpcy5fdG9vbHRpcC51cGRhdGVQb3NpdGlvbih0LmxhdGxuZyl9LF9oYXNBdmFpbGFibGVMYXllcnM6ZnVuY3Rpb24oKXtyZXR1cm4gMCE9PXRoaXMuX2ZlYXR1cmVHcm91cC5nZXRMYXllcnMoKS5sZW5ndGh9fSksTC5FZGl0VG9vbGJhci5EZWxldGU9TC5IYW5kbGVyLmV4dGVuZCh7c3RhdGljczp7VFlQRTpcInJlbW92ZVwifSxpbmNsdWRlczpMLk1peGluLkV2ZW50cyxpbml0aWFsaXplOmZ1bmN0aW9uKHQsZSl7aWYoTC5IYW5kbGVyLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcyx0KSxMLlV0aWwuc2V0T3B0aW9ucyh0aGlzLGUpLHRoaXMuX2RlbGV0YWJsZUxheWVycz10aGlzLm9wdGlvbnMuZmVhdHVyZUdyb3VwLCEodGhpcy5fZGVsZXRhYmxlTGF5ZXJzIGluc3RhbmNlb2YgTC5GZWF0dXJlR3JvdXApKXRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMuZmVhdHVyZUdyb3VwIG11c3QgYmUgYSBMLkZlYXR1cmVHcm91cFwiKTt0aGlzLnR5cGU9TC5FZGl0VG9vbGJhci5EZWxldGUuVFlQRX0sZW5hYmxlOmZ1bmN0aW9uKCl7IXRoaXMuX2VuYWJsZWQmJnRoaXMuX2hhc0F2YWlsYWJsZUxheWVycygpJiYodGhpcy5maXJlKFwiZW5hYmxlZFwiLHtoYW5kbGVyOnRoaXMudHlwZX0pLHRoaXMuX21hcC5maXJlKFwiZHJhdzpkZWxldGVzdGFydFwiLHtoYW5kbGVyOnRoaXMudHlwZX0pLEwuSGFuZGxlci5wcm90b3R5cGUuZW5hYmxlLmNhbGwodGhpcyksdGhpcy5fZGVsZXRhYmxlTGF5ZXJzLm9uKFwibGF5ZXJhZGRcIix0aGlzLl9lbmFibGVMYXllckRlbGV0ZSx0aGlzKS5vbihcImxheWVycmVtb3ZlXCIsdGhpcy5fZGlzYWJsZUxheWVyRGVsZXRlLHRoaXMpKX0sZGlzYWJsZTpmdW5jdGlvbigpe3RoaXMuX2VuYWJsZWQmJih0aGlzLl9kZWxldGFibGVMYXllcnMub2ZmKFwibGF5ZXJhZGRcIix0aGlzLl9lbmFibGVMYXllckRlbGV0ZSx0aGlzKS5vZmYoXCJsYXllcnJlbW92ZVwiLHRoaXMuX2Rpc2FibGVMYXllckRlbGV0ZSx0aGlzKSxMLkhhbmRsZXIucHJvdG90eXBlLmRpc2FibGUuY2FsbCh0aGlzKSx0aGlzLl9tYXAuZmlyZShcImRyYXc6ZGVsZXRlc3RvcFwiLHtoYW5kbGVyOnRoaXMudHlwZX0pLHRoaXMuZmlyZShcImRpc2FibGVkXCIse2hhbmRsZXI6dGhpcy50eXBlfSkpfSxhZGRIb29rczpmdW5jdGlvbigpe3ZhciB0PXRoaXMuX21hcDt0JiYodC5nZXRDb250YWluZXIoKS5mb2N1cygpLHRoaXMuX2RlbGV0YWJsZUxheWVycy5lYWNoTGF5ZXIodGhpcy5fZW5hYmxlTGF5ZXJEZWxldGUsdGhpcyksdGhpcy5fZGVsZXRlZExheWVycz1uZXcgTC5sYXllckdyb3VwLHRoaXMuX3Rvb2x0aXA9bmV3IEwuVG9vbHRpcCh0aGlzLl9tYXApLHRoaXMuX3Rvb2x0aXAudXBkYXRlQ29udGVudCh7dGV4dDpMLmRyYXdMb2NhbC5lZGl0LmhhbmRsZXJzLnJlbW92ZS50b29sdGlwLnRleHR9KSx0aGlzLl9tYXAub24oXCJtb3VzZW1vdmVcIix0aGlzLl9vbk1vdXNlTW92ZSx0aGlzKSl9LHJlbW92ZUhvb2tzOmZ1bmN0aW9uKCl7dGhpcy5fbWFwJiYodGhpcy5fZGVsZXRhYmxlTGF5ZXJzLmVhY2hMYXllcih0aGlzLl9kaXNhYmxlTGF5ZXJEZWxldGUsdGhpcyksdGhpcy5fZGVsZXRlZExheWVycz1udWxsLHRoaXMuX3Rvb2x0aXAuZGlzcG9zZSgpLHRoaXMuX3Rvb2x0aXA9bnVsbCx0aGlzLl9tYXAub2ZmKFwibW91c2Vtb3ZlXCIsdGhpcy5fb25Nb3VzZU1vdmUsdGhpcykpfSxyZXZlcnRMYXllcnM6ZnVuY3Rpb24oKXt0aGlzLl9kZWxldGVkTGF5ZXJzLmVhY2hMYXllcihmdW5jdGlvbih0KXt0aGlzLl9kZWxldGFibGVMYXllcnMuYWRkTGF5ZXIodCl9LHRoaXMpfSxzYXZlOmZ1bmN0aW9uKCl7dGhpcy5fbWFwLmZpcmUoXCJkcmF3OmRlbGV0ZWRcIix7bGF5ZXJzOnRoaXMuX2RlbGV0ZWRMYXllcnN9KX0sX2VuYWJsZUxheWVyRGVsZXRlOmZ1bmN0aW9uKHQpe3ZhciBlPXQubGF5ZXJ8fHQudGFyZ2V0fHx0O2Uub24oXCJjbGlja1wiLHRoaXMuX3JlbW92ZUxheWVyLHRoaXMpfSxfZGlzYWJsZUxheWVyRGVsZXRlOmZ1bmN0aW9uKHQpe3ZhciBlPXQubGF5ZXJ8fHQudGFyZ2V0fHx0O2Uub2ZmKFwiY2xpY2tcIix0aGlzLl9yZW1vdmVMYXllcix0aGlzKSx0aGlzLl9kZWxldGVkTGF5ZXJzLnJlbW92ZUxheWVyKGUpfSxfcmVtb3ZlTGF5ZXI6ZnVuY3Rpb24odCl7dmFyIGU9dC5sYXllcnx8dC50YXJnZXR8fHQ7dGhpcy5fZGVsZXRhYmxlTGF5ZXJzLnJlbW92ZUxheWVyKGUpLHRoaXMuX2RlbGV0ZWRMYXllcnMuYWRkTGF5ZXIoZSl9LF9vbk1vdXNlTW92ZTpmdW5jdGlvbih0KXt0aGlzLl90b29sdGlwLnVwZGF0ZVBvc2l0aW9uKHQubGF0bG5nKX0sX2hhc0F2YWlsYWJsZUxheWVyczpmdW5jdGlvbigpe3JldHVybiAwIT09dGhpcy5fZGVsZXRhYmxlTGF5ZXJzLmdldExheWVycygpLmxlbmd0aH19KX0od2luZG93LGRvY3VtZW50KTsiLCIvKlxuIExlYWZsZXQsIGEgSmF2YVNjcmlwdCBsaWJyYXJ5IGZvciBtb2JpbGUtZnJpZW5kbHkgaW50ZXJhY3RpdmUgbWFwcy4gaHR0cDovL2xlYWZsZXRqcy5jb21cbiAoYykgMjAxMC0yMDEzLCBWbGFkaW1pciBBZ2Fmb25raW5cbiAoYykgMjAxMC0yMDExLCBDbG91ZE1hZGVcbiovXG4oZnVuY3Rpb24gKHdpbmRvdywgZG9jdW1lbnQsIHVuZGVmaW5lZCkge1xyXG52YXIgb2xkTCA9IHdpbmRvdy5MLFxyXG4gICAgTCA9IHt9O1xyXG5cclxuTC52ZXJzaW9uID0gJzAuNy41JztcclxuXHJcbi8vIGRlZmluZSBMZWFmbGV0IGZvciBOb2RlIG1vZHVsZSBwYXR0ZXJuIGxvYWRlcnMsIGluY2x1ZGluZyBCcm93c2VyaWZ5XHJcbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgPT09ICdvYmplY3QnKSB7XHJcblx0bW9kdWxlLmV4cG9ydHMgPSBMO1xyXG5cclxuLy8gZGVmaW5lIExlYWZsZXQgYXMgYW4gQU1EIG1vZHVsZVxyXG59IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xyXG5cdGRlZmluZShMKTtcclxufVxyXG5cclxuLy8gZGVmaW5lIExlYWZsZXQgYXMgYSBnbG9iYWwgTCB2YXJpYWJsZSwgc2F2aW5nIHRoZSBvcmlnaW5hbCBMIHRvIHJlc3RvcmUgbGF0ZXIgaWYgbmVlZGVkXHJcblxyXG5MLm5vQ29uZmxpY3QgPSBmdW5jdGlvbiAoKSB7XHJcblx0d2luZG93LkwgPSBvbGRMO1xyXG5cdHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxud2luZG93LkwgPSBMO1xyXG5cblxuLypcclxuICogTC5VdGlsIGNvbnRhaW5zIHZhcmlvdXMgdXRpbGl0eSBmdW5jdGlvbnMgdXNlZCB0aHJvdWdob3V0IExlYWZsZXQgY29kZS5cclxuICovXHJcblxyXG5MLlV0aWwgPSB7XHJcblx0ZXh0ZW5kOiBmdW5jdGlvbiAoZGVzdCkgeyAvLyAoT2JqZWN0WywgT2JqZWN0LCAuLi5dKSAtPlxyXG5cdFx0dmFyIHNvdXJjZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLFxyXG5cdFx0ICAgIGksIGosIGxlbiwgc3JjO1xyXG5cclxuXHRcdGZvciAoaiA9IDAsIGxlbiA9IHNvdXJjZXMubGVuZ3RoOyBqIDwgbGVuOyBqKyspIHtcclxuXHRcdFx0c3JjID0gc291cmNlc1tqXSB8fCB7fTtcclxuXHRcdFx0Zm9yIChpIGluIHNyYykge1xyXG5cdFx0XHRcdGlmIChzcmMuaGFzT3duUHJvcGVydHkoaSkpIHtcclxuXHRcdFx0XHRcdGRlc3RbaV0gPSBzcmNbaV07XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZGVzdDtcclxuXHR9LFxyXG5cclxuXHRiaW5kOiBmdW5jdGlvbiAoZm4sIG9iaikgeyAvLyAoRnVuY3Rpb24sIE9iamVjdCkgLT4gRnVuY3Rpb25cclxuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzLmxlbmd0aCA+IDIgPyBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpIDogbnVsbDtcclxuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdHJldHVybiBmbi5hcHBseShvYmosIGFyZ3MgfHwgYXJndW1lbnRzKTtcclxuXHRcdH07XHJcblx0fSxcclxuXHJcblx0c3RhbXA6IChmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgbGFzdElkID0gMCxcclxuXHRcdCAgICBrZXkgPSAnX2xlYWZsZXRfaWQnO1xyXG5cdFx0cmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcclxuXHRcdFx0b2JqW2tleV0gPSBvYmpba2V5XSB8fCArK2xhc3RJZDtcclxuXHRcdFx0cmV0dXJuIG9ialtrZXldO1xyXG5cdFx0fTtcclxuXHR9KCkpLFxyXG5cclxuXHRpbnZva2VFYWNoOiBmdW5jdGlvbiAob2JqLCBtZXRob2QsIGNvbnRleHQpIHtcclxuXHRcdHZhciBpLCBhcmdzO1xyXG5cclxuXHRcdGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xyXG5cdFx0XHRhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKTtcclxuXHJcblx0XHRcdGZvciAoaSBpbiBvYmopIHtcclxuXHRcdFx0XHRtZXRob2QuYXBwbHkoY29udGV4dCwgW2ksIG9ialtpXV0uY29uY2F0KGFyZ3MpKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gZmFsc2U7XHJcblx0fSxcclxuXHJcblx0bGltaXRFeGVjQnlJbnRlcnZhbDogZnVuY3Rpb24gKGZuLCB0aW1lLCBjb250ZXh0KSB7XHJcblx0XHR2YXIgbG9jaywgZXhlY09uVW5sb2NrO1xyXG5cclxuXHRcdHJldHVybiBmdW5jdGlvbiB3cmFwcGVyRm4oKSB7XHJcblx0XHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xyXG5cclxuXHRcdFx0aWYgKGxvY2spIHtcclxuXHRcdFx0XHRleGVjT25VbmxvY2sgPSB0cnVlO1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0bG9jayA9IHRydWU7XHJcblxyXG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0XHRsb2NrID0gZmFsc2U7XHJcblxyXG5cdFx0XHRcdGlmIChleGVjT25VbmxvY2spIHtcclxuXHRcdFx0XHRcdHdyYXBwZXJGbi5hcHBseShjb250ZXh0LCBhcmdzKTtcclxuXHRcdFx0XHRcdGV4ZWNPblVubG9jayA9IGZhbHNlO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSwgdGltZSk7XHJcblxyXG5cdFx0XHRmbi5hcHBseShjb250ZXh0LCBhcmdzKTtcclxuXHRcdH07XHJcblx0fSxcclxuXHJcblx0ZmFsc2VGbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH0sXHJcblxyXG5cdGZvcm1hdE51bTogZnVuY3Rpb24gKG51bSwgZGlnaXRzKSB7XHJcblx0XHR2YXIgcG93ID0gTWF0aC5wb3coMTAsIGRpZ2l0cyB8fCA1KTtcclxuXHRcdHJldHVybiBNYXRoLnJvdW5kKG51bSAqIHBvdykgLyBwb3c7XHJcblx0fSxcclxuXHJcblx0dHJpbTogZnVuY3Rpb24gKHN0cikge1xyXG5cdFx0cmV0dXJuIHN0ci50cmltID8gc3RyLnRyaW0oKSA6IHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJyk7XHJcblx0fSxcclxuXHJcblx0c3BsaXRXb3JkczogZnVuY3Rpb24gKHN0cikge1xyXG5cdFx0cmV0dXJuIEwuVXRpbC50cmltKHN0cikuc3BsaXQoL1xccysvKTtcclxuXHR9LFxyXG5cclxuXHRzZXRPcHRpb25zOiBmdW5jdGlvbiAob2JqLCBvcHRpb25zKSB7XHJcblx0XHRvYmoub3B0aW9ucyA9IEwuZXh0ZW5kKHt9LCBvYmoub3B0aW9ucywgb3B0aW9ucyk7XHJcblx0XHRyZXR1cm4gb2JqLm9wdGlvbnM7XHJcblx0fSxcclxuXHJcblx0Z2V0UGFyYW1TdHJpbmc6IGZ1bmN0aW9uIChvYmosIGV4aXN0aW5nVXJsLCB1cHBlcmNhc2UpIHtcclxuXHRcdHZhciBwYXJhbXMgPSBbXTtcclxuXHRcdGZvciAodmFyIGkgaW4gb2JqKSB7XHJcblx0XHRcdHBhcmFtcy5wdXNoKGVuY29kZVVSSUNvbXBvbmVudCh1cHBlcmNhc2UgPyBpLnRvVXBwZXJDYXNlKCkgOiBpKSArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbaV0pKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiAoKCFleGlzdGluZ1VybCB8fCBleGlzdGluZ1VybC5pbmRleE9mKCc/JykgPT09IC0xKSA/ICc/JyA6ICcmJykgKyBwYXJhbXMuam9pbignJicpO1xyXG5cdH0sXHJcblx0dGVtcGxhdGU6IGZ1bmN0aW9uIChzdHIsIGRhdGEpIHtcclxuXHRcdHJldHVybiBzdHIucmVwbGFjZSgvXFx7ICooW1xcd19dKykgKlxcfS9nLCBmdW5jdGlvbiAoc3RyLCBrZXkpIHtcclxuXHRcdFx0dmFyIHZhbHVlID0gZGF0YVtrZXldO1xyXG5cdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gdmFsdWUgcHJvdmlkZWQgZm9yIHZhcmlhYmxlICcgKyBzdHIpO1xyXG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG5cdFx0XHRcdHZhbHVlID0gdmFsdWUoZGF0YSk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIHZhbHVlO1xyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0aXNBcnJheTogQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAob2JqKSB7XHJcblx0XHRyZXR1cm4gKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nKTtcclxuXHR9LFxyXG5cclxuXHRlbXB0eUltYWdlVXJsOiAnZGF0YTppbWFnZS9naWY7YmFzZTY0LFIwbEdPRGxoQVFBQkFBRC9BQ3dBQUFBQUFRQUJBQUFDQURzPSdcclxufTtcclxuXHJcbihmdW5jdGlvbiAoKSB7XHJcblxyXG5cdC8vIGluc3BpcmVkIGJ5IGh0dHA6Ly9wYXVsaXJpc2guY29tLzIwMTEvcmVxdWVzdGFuaW1hdGlvbmZyYW1lLWZvci1zbWFydC1hbmltYXRpbmcvXHJcblxyXG5cdGZ1bmN0aW9uIGdldFByZWZpeGVkKG5hbWUpIHtcclxuXHRcdHZhciBpLCBmbixcclxuXHRcdCAgICBwcmVmaXhlcyA9IFsnd2Via2l0JywgJ21veicsICdvJywgJ21zJ107XHJcblxyXG5cdFx0Zm9yIChpID0gMDsgaSA8IHByZWZpeGVzLmxlbmd0aCAmJiAhZm47IGkrKykge1xyXG5cdFx0XHRmbiA9IHdpbmRvd1twcmVmaXhlc1tpXSArIG5hbWVdO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBmbjtcclxuXHR9XHJcblxyXG5cdHZhciBsYXN0VGltZSA9IDA7XHJcblxyXG5cdGZ1bmN0aW9uIHRpbWVvdXREZWZlcihmbikge1xyXG5cdFx0dmFyIHRpbWUgPSArbmV3IERhdGUoKSxcclxuXHRcdCAgICB0aW1lVG9DYWxsID0gTWF0aC5tYXgoMCwgMTYgLSAodGltZSAtIGxhc3RUaW1lKSk7XHJcblxyXG5cdFx0bGFzdFRpbWUgPSB0aW1lICsgdGltZVRvQ2FsbDtcclxuXHRcdHJldHVybiB3aW5kb3cuc2V0VGltZW91dChmbiwgdGltZVRvQ2FsbCk7XHJcblx0fVxyXG5cclxuXHR2YXIgcmVxdWVzdEZuID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxyXG5cdCAgICAgICAgZ2V0UHJlZml4ZWQoJ1JlcXVlc3RBbmltYXRpb25GcmFtZScpIHx8IHRpbWVvdXREZWZlcjtcclxuXHJcblx0dmFyIGNhbmNlbEZuID0gd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lIHx8XHJcblx0ICAgICAgICBnZXRQcmVmaXhlZCgnQ2FuY2VsQW5pbWF0aW9uRnJhbWUnKSB8fFxyXG5cdCAgICAgICAgZ2V0UHJlZml4ZWQoJ0NhbmNlbFJlcXVlc3RBbmltYXRpb25GcmFtZScpIHx8XHJcblx0ICAgICAgICBmdW5jdGlvbiAoaWQpIHsgd2luZG93LmNsZWFyVGltZW91dChpZCk7IH07XHJcblxyXG5cclxuXHRMLlV0aWwucmVxdWVzdEFuaW1GcmFtZSA9IGZ1bmN0aW9uIChmbiwgY29udGV4dCwgaW1tZWRpYXRlLCBlbGVtZW50KSB7XHJcblx0XHRmbiA9IEwuYmluZChmbiwgY29udGV4dCk7XHJcblxyXG5cdFx0aWYgKGltbWVkaWF0ZSAmJiByZXF1ZXN0Rm4gPT09IHRpbWVvdXREZWZlcikge1xyXG5cdFx0XHRmbigpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cmV0dXJuIHJlcXVlc3RGbi5jYWxsKHdpbmRvdywgZm4sIGVsZW1lbnQpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdEwuVXRpbC5jYW5jZWxBbmltRnJhbWUgPSBmdW5jdGlvbiAoaWQpIHtcclxuXHRcdGlmIChpZCkge1xyXG5cdFx0XHRjYW5jZWxGbi5jYWxsKHdpbmRvdywgaWQpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG59KCkpO1xyXG5cclxuLy8gc2hvcnRjdXRzIGZvciBtb3N0IHVzZWQgdXRpbGl0eSBmdW5jdGlvbnNcclxuTC5leHRlbmQgPSBMLlV0aWwuZXh0ZW5kO1xyXG5MLmJpbmQgPSBMLlV0aWwuYmluZDtcclxuTC5zdGFtcCA9IEwuVXRpbC5zdGFtcDtcclxuTC5zZXRPcHRpb25zID0gTC5VdGlsLnNldE9wdGlvbnM7XHJcblxuXG4vKlxyXG4gKiBMLkNsYXNzIHBvd2VycyB0aGUgT09QIGZhY2lsaXRpZXMgb2YgdGhlIGxpYnJhcnkuXHJcbiAqIFRoYW5rcyB0byBKb2huIFJlc2lnIGFuZCBEZWFuIEVkd2FyZHMgZm9yIGluc3BpcmF0aW9uIVxyXG4gKi9cclxuXHJcbkwuQ2xhc3MgPSBmdW5jdGlvbiAoKSB7fTtcclxuXHJcbkwuQ2xhc3MuZXh0ZW5kID0gZnVuY3Rpb24gKHByb3BzKSB7XHJcblxyXG5cdC8vIGV4dGVuZGVkIGNsYXNzIHdpdGggdGhlIG5ldyBwcm90b3R5cGVcclxuXHR2YXIgTmV3Q2xhc3MgPSBmdW5jdGlvbiAoKSB7XHJcblxyXG5cdFx0Ly8gY2FsbCB0aGUgY29uc3RydWN0b3JcclxuXHRcdGlmICh0aGlzLmluaXRpYWxpemUpIHtcclxuXHRcdFx0dGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gY2FsbCBhbGwgY29uc3RydWN0b3IgaG9va3NcclxuXHRcdGlmICh0aGlzLl9pbml0SG9va3MpIHtcclxuXHRcdFx0dGhpcy5jYWxsSW5pdEhvb2tzKCk7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0Ly8gaW5zdGFudGlhdGUgY2xhc3Mgd2l0aG91dCBjYWxsaW5nIGNvbnN0cnVjdG9yXHJcblx0dmFyIEYgPSBmdW5jdGlvbiAoKSB7fTtcclxuXHRGLnByb3RvdHlwZSA9IHRoaXMucHJvdG90eXBlO1xyXG5cclxuXHR2YXIgcHJvdG8gPSBuZXcgRigpO1xyXG5cdHByb3RvLmNvbnN0cnVjdG9yID0gTmV3Q2xhc3M7XHJcblxyXG5cdE5ld0NsYXNzLnByb3RvdHlwZSA9IHByb3RvO1xyXG5cclxuXHQvL2luaGVyaXQgcGFyZW50J3Mgc3RhdGljc1xyXG5cdGZvciAodmFyIGkgaW4gdGhpcykge1xyXG5cdFx0aWYgKHRoaXMuaGFzT3duUHJvcGVydHkoaSkgJiYgaSAhPT0gJ3Byb3RvdHlwZScpIHtcclxuXHRcdFx0TmV3Q2xhc3NbaV0gPSB0aGlzW2ldO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Ly8gbWl4IHN0YXRpYyBwcm9wZXJ0aWVzIGludG8gdGhlIGNsYXNzXHJcblx0aWYgKHByb3BzLnN0YXRpY3MpIHtcclxuXHRcdEwuZXh0ZW5kKE5ld0NsYXNzLCBwcm9wcy5zdGF0aWNzKTtcclxuXHRcdGRlbGV0ZSBwcm9wcy5zdGF0aWNzO1xyXG5cdH1cclxuXHJcblx0Ly8gbWl4IGluY2x1ZGVzIGludG8gdGhlIHByb3RvdHlwZVxyXG5cdGlmIChwcm9wcy5pbmNsdWRlcykge1xyXG5cdFx0TC5VdGlsLmV4dGVuZC5hcHBseShudWxsLCBbcHJvdG9dLmNvbmNhdChwcm9wcy5pbmNsdWRlcykpO1xyXG5cdFx0ZGVsZXRlIHByb3BzLmluY2x1ZGVzO1xyXG5cdH1cclxuXHJcblx0Ly8gbWVyZ2Ugb3B0aW9uc1xyXG5cdGlmIChwcm9wcy5vcHRpb25zICYmIHByb3RvLm9wdGlvbnMpIHtcclxuXHRcdHByb3BzLm9wdGlvbnMgPSBMLmV4dGVuZCh7fSwgcHJvdG8ub3B0aW9ucywgcHJvcHMub3B0aW9ucyk7XHJcblx0fVxyXG5cclxuXHQvLyBtaXggZ2l2ZW4gcHJvcGVydGllcyBpbnRvIHRoZSBwcm90b3R5cGVcclxuXHRMLmV4dGVuZChwcm90bywgcHJvcHMpO1xyXG5cclxuXHRwcm90by5faW5pdEhvb2tzID0gW107XHJcblxyXG5cdHZhciBwYXJlbnQgPSB0aGlzO1xyXG5cdC8vIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlXHJcblx0TmV3Q2xhc3MuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTtcclxuXHJcblx0Ly8gYWRkIG1ldGhvZCBmb3IgY2FsbGluZyBhbGwgaG9va3NcclxuXHRwcm90by5jYWxsSW5pdEhvb2tzID0gZnVuY3Rpb24gKCkge1xyXG5cclxuXHRcdGlmICh0aGlzLl9pbml0SG9va3NDYWxsZWQpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0aWYgKHBhcmVudC5wcm90b3R5cGUuY2FsbEluaXRIb29rcykge1xyXG5cdFx0XHRwYXJlbnQucHJvdG90eXBlLmNhbGxJbml0SG9va3MuY2FsbCh0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9pbml0SG9va3NDYWxsZWQgPSB0cnVlO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSBwcm90by5faW5pdEhvb2tzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHByb3RvLl9pbml0SG9va3NbaV0uY2FsbCh0aGlzKTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHRyZXR1cm4gTmV3Q2xhc3M7XHJcbn07XHJcblxyXG5cclxuLy8gbWV0aG9kIGZvciBhZGRpbmcgcHJvcGVydGllcyB0byBwcm90b3R5cGVcclxuTC5DbGFzcy5pbmNsdWRlID0gZnVuY3Rpb24gKHByb3BzKSB7XHJcblx0TC5leHRlbmQodGhpcy5wcm90b3R5cGUsIHByb3BzKTtcclxufTtcclxuXHJcbi8vIG1lcmdlIG5ldyBkZWZhdWx0IG9wdGlvbnMgdG8gdGhlIENsYXNzXHJcbkwuQ2xhc3MubWVyZ2VPcHRpb25zID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRMLmV4dGVuZCh0aGlzLnByb3RvdHlwZS5vcHRpb25zLCBvcHRpb25zKTtcclxufTtcclxuXHJcbi8vIGFkZCBhIGNvbnN0cnVjdG9yIGhvb2tcclxuTC5DbGFzcy5hZGRJbml0SG9vayA9IGZ1bmN0aW9uIChmbikgeyAvLyAoRnVuY3Rpb24pIHx8IChTdHJpbmcsIGFyZ3MuLi4pXHJcblx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xyXG5cclxuXHR2YXIgaW5pdCA9IHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJyA/IGZuIDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpc1tmbl0uYXBwbHkodGhpcywgYXJncyk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5wcm90b3R5cGUuX2luaXRIb29rcyA9IHRoaXMucHJvdG90eXBlLl9pbml0SG9va3MgfHwgW107XHJcblx0dGhpcy5wcm90b3R5cGUuX2luaXRIb29rcy5wdXNoKGluaXQpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5NaXhpbi5FdmVudHMgaXMgdXNlZCB0byBhZGQgY3VzdG9tIGV2ZW50cyBmdW5jdGlvbmFsaXR5IHRvIExlYWZsZXQgY2xhc3Nlcy5cclxuICovXHJcblxyXG52YXIgZXZlbnRzS2V5ID0gJ19sZWFmbGV0X2V2ZW50cyc7XHJcblxyXG5MLk1peGluID0ge307XHJcblxyXG5MLk1peGluLkV2ZW50cyA9IHtcclxuXHJcblx0YWRkRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24gKHR5cGVzLCBmbiwgY29udGV4dCkgeyAvLyAoU3RyaW5nLCBGdW5jdGlvblssIE9iamVjdF0pIG9yIChPYmplY3RbLCBPYmplY3RdKVxyXG5cclxuXHRcdC8vIHR5cGVzIGNhbiBiZSBhIG1hcCBvZiB0eXBlcy9oYW5kbGVyc1xyXG5cdFx0aWYgKEwuVXRpbC5pbnZva2VFYWNoKHR5cGVzLCB0aGlzLmFkZEV2ZW50TGlzdGVuZXIsIHRoaXMsIGZuLCBjb250ZXh0KSkgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdHZhciBldmVudHMgPSB0aGlzW2V2ZW50c0tleV0gPSB0aGlzW2V2ZW50c0tleV0gfHwge30sXHJcblx0XHQgICAgY29udGV4dElkID0gY29udGV4dCAmJiBjb250ZXh0ICE9PSB0aGlzICYmIEwuc3RhbXAoY29udGV4dCksXHJcblx0XHQgICAgaSwgbGVuLCBldmVudCwgdHlwZSwgaW5kZXhLZXksIGluZGV4TGVuS2V5LCB0eXBlSW5kZXg7XHJcblxyXG5cdFx0Ly8gdHlwZXMgY2FuIGJlIGEgc3RyaW5nIG9mIHNwYWNlLXNlcGFyYXRlZCB3b3Jkc1xyXG5cdFx0dHlwZXMgPSBMLlV0aWwuc3BsaXRXb3Jkcyh0eXBlcyk7XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdHlwZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0ZXZlbnQgPSB7XHJcblx0XHRcdFx0YWN0aW9uOiBmbixcclxuXHRcdFx0XHRjb250ZXh0OiBjb250ZXh0IHx8IHRoaXNcclxuXHRcdFx0fTtcclxuXHRcdFx0dHlwZSA9IHR5cGVzW2ldO1xyXG5cclxuXHRcdFx0aWYgKGNvbnRleHRJZCkge1xyXG5cdFx0XHRcdC8vIHN0b3JlIGxpc3RlbmVycyBvZiBhIHBhcnRpY3VsYXIgY29udGV4dCBpbiBhIHNlcGFyYXRlIGhhc2ggKGlmIGl0IGhhcyBhbiBpZClcclxuXHRcdFx0XHQvLyBnaXZlcyBhIG1ham9yIHBlcmZvcm1hbmNlIGJvb3N0IHdoZW4gcmVtb3ZpbmcgdGhvdXNhbmRzIG9mIG1hcCBsYXllcnNcclxuXHJcblx0XHRcdFx0aW5kZXhLZXkgPSB0eXBlICsgJ19pZHgnO1xyXG5cdFx0XHRcdGluZGV4TGVuS2V5ID0gaW5kZXhLZXkgKyAnX2xlbic7XHJcblxyXG5cdFx0XHRcdHR5cGVJbmRleCA9IGV2ZW50c1tpbmRleEtleV0gPSBldmVudHNbaW5kZXhLZXldIHx8IHt9O1xyXG5cclxuXHRcdFx0XHRpZiAoIXR5cGVJbmRleFtjb250ZXh0SWRdKSB7XHJcblx0XHRcdFx0XHR0eXBlSW5kZXhbY29udGV4dElkXSA9IFtdO1xyXG5cclxuXHRcdFx0XHRcdC8vIGtlZXAgdHJhY2sgb2YgdGhlIG51bWJlciBvZiBrZXlzIGluIHRoZSBpbmRleCB0byBxdWlja2x5IGNoZWNrIGlmIGl0J3MgZW1wdHlcclxuXHRcdFx0XHRcdGV2ZW50c1tpbmRleExlbktleV0gPSAoZXZlbnRzW2luZGV4TGVuS2V5XSB8fCAwKSArIDE7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHR0eXBlSW5kZXhbY29udGV4dElkXS5wdXNoKGV2ZW50KTtcclxuXHJcblxyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGV2ZW50c1t0eXBlXSA9IGV2ZW50c1t0eXBlXSB8fCBbXTtcclxuXHRcdFx0XHRldmVudHNbdHlwZV0ucHVzaChldmVudCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRoYXNFdmVudExpc3RlbmVyczogZnVuY3Rpb24gKHR5cGUpIHsgLy8gKFN0cmluZykgLT4gQm9vbGVhblxyXG5cdFx0dmFyIGV2ZW50cyA9IHRoaXNbZXZlbnRzS2V5XTtcclxuXHRcdHJldHVybiAhIWV2ZW50cyAmJiAoKHR5cGUgaW4gZXZlbnRzICYmIGV2ZW50c1t0eXBlXS5sZW5ndGggPiAwKSB8fFxyXG5cdFx0ICAgICAgICAgICAgICAgICAgICAodHlwZSArICdfaWR4JyBpbiBldmVudHMgJiYgZXZlbnRzW3R5cGUgKyAnX2lkeF9sZW4nXSA+IDApKTtcclxuXHR9LFxyXG5cclxuXHRyZW1vdmVFdmVudExpc3RlbmVyOiBmdW5jdGlvbiAodHlwZXMsIGZuLCBjb250ZXh0KSB7IC8vIChbU3RyaW5nLCBGdW5jdGlvbiwgT2JqZWN0XSkgb3IgKE9iamVjdFssIE9iamVjdF0pXHJcblxyXG5cdFx0aWYgKCF0aGlzW2V2ZW50c0tleV0pIHtcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCF0eXBlcykge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhckFsbEV2ZW50TGlzdGVuZXJzKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKEwuVXRpbC5pbnZva2VFYWNoKHR5cGVzLCB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIsIHRoaXMsIGZuLCBjb250ZXh0KSkgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdHZhciBldmVudHMgPSB0aGlzW2V2ZW50c0tleV0sXHJcblx0XHQgICAgY29udGV4dElkID0gY29udGV4dCAmJiBjb250ZXh0ICE9PSB0aGlzICYmIEwuc3RhbXAoY29udGV4dCksXHJcblx0XHQgICAgaSwgbGVuLCB0eXBlLCBsaXN0ZW5lcnMsIGosIGluZGV4S2V5LCBpbmRleExlbktleSwgdHlwZUluZGV4LCByZW1vdmVkO1xyXG5cclxuXHRcdHR5cGVzID0gTC5VdGlsLnNwbGl0V29yZHModHlwZXMpO1xyXG5cclxuXHRcdGZvciAoaSA9IDAsIGxlbiA9IHR5cGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHR5cGUgPSB0eXBlc1tpXTtcclxuXHRcdFx0aW5kZXhLZXkgPSB0eXBlICsgJ19pZHgnO1xyXG5cdFx0XHRpbmRleExlbktleSA9IGluZGV4S2V5ICsgJ19sZW4nO1xyXG5cclxuXHRcdFx0dHlwZUluZGV4ID0gZXZlbnRzW2luZGV4S2V5XTtcclxuXHJcblx0XHRcdGlmICghZm4pIHtcclxuXHRcdFx0XHQvLyBjbGVhciBhbGwgbGlzdGVuZXJzIGZvciBhIHR5cGUgaWYgZnVuY3Rpb24gaXNuJ3Qgc3BlY2lmaWVkXHJcblx0XHRcdFx0ZGVsZXRlIGV2ZW50c1t0eXBlXTtcclxuXHRcdFx0XHRkZWxldGUgZXZlbnRzW2luZGV4S2V5XTtcclxuXHRcdFx0XHRkZWxldGUgZXZlbnRzW2luZGV4TGVuS2V5XTtcclxuXHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0bGlzdGVuZXJzID0gY29udGV4dElkICYmIHR5cGVJbmRleCA/IHR5cGVJbmRleFtjb250ZXh0SWRdIDogZXZlbnRzW3R5cGVdO1xyXG5cclxuXHRcdFx0XHRpZiAobGlzdGVuZXJzKSB7XHJcblx0XHRcdFx0XHRmb3IgKGogPSBsaXN0ZW5lcnMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcclxuXHRcdFx0XHRcdFx0aWYgKChsaXN0ZW5lcnNbal0uYWN0aW9uID09PSBmbikgJiYgKCFjb250ZXh0IHx8IChsaXN0ZW5lcnNbal0uY29udGV4dCA9PT0gY29udGV4dCkpKSB7XHJcblx0XHRcdFx0XHRcdFx0cmVtb3ZlZCA9IGxpc3RlbmVycy5zcGxpY2UoaiwgMSk7XHJcblx0XHRcdFx0XHRcdFx0Ly8gc2V0IHRoZSBvbGQgYWN0aW9uIHRvIGEgbm8tb3AsIGJlY2F1c2UgaXQgaXMgcG9zc2libGVcclxuXHRcdFx0XHRcdFx0XHQvLyB0aGF0IHRoZSBsaXN0ZW5lciBpcyBiZWluZyBpdGVyYXRlZCBvdmVyIGFzIHBhcnQgb2YgYSBkaXNwYXRjaFxyXG5cdFx0XHRcdFx0XHRcdHJlbW92ZWRbMF0uYWN0aW9uID0gTC5VdGlsLmZhbHNlRm47XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRpZiAoY29udGV4dCAmJiB0eXBlSW5kZXggJiYgKGxpc3RlbmVycy5sZW5ndGggPT09IDApKSB7XHJcblx0XHRcdFx0XHRcdGRlbGV0ZSB0eXBlSW5kZXhbY29udGV4dElkXTtcclxuXHRcdFx0XHRcdFx0ZXZlbnRzW2luZGV4TGVuS2V5XS0tO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGNsZWFyQWxsRXZlbnRMaXN0ZW5lcnM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGRlbGV0ZSB0aGlzW2V2ZW50c0tleV07XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRmaXJlRXZlbnQ6IGZ1bmN0aW9uICh0eXBlLCBkYXRhKSB7IC8vIChTdHJpbmdbLCBPYmplY3RdKVxyXG5cdFx0aWYgKCF0aGlzLmhhc0V2ZW50TGlzdGVuZXJzKHR5cGUpKSB7XHJcblx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBldmVudCA9IEwuVXRpbC5leHRlbmQoe30sIGRhdGEsIHsgdHlwZTogdHlwZSwgdGFyZ2V0OiB0aGlzIH0pO1xyXG5cclxuXHRcdHZhciBldmVudHMgPSB0aGlzW2V2ZW50c0tleV0sXHJcblx0XHQgICAgbGlzdGVuZXJzLCBpLCBsZW4sIHR5cGVJbmRleCwgY29udGV4dElkO1xyXG5cclxuXHRcdGlmIChldmVudHNbdHlwZV0pIHtcclxuXHRcdFx0Ly8gbWFrZSBzdXJlIGFkZGluZy9yZW1vdmluZyBsaXN0ZW5lcnMgaW5zaWRlIG90aGVyIGxpc3RlbmVycyB3b24ndCBjYXVzZSBpbmZpbml0ZSBsb29wXHJcblx0XHRcdGxpc3RlbmVycyA9IGV2ZW50c1t0eXBlXS5zbGljZSgpO1xyXG5cclxuXHRcdFx0Zm9yIChpID0gMCwgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0bGlzdGVuZXJzW2ldLmFjdGlvbi5jYWxsKGxpc3RlbmVyc1tpXS5jb250ZXh0LCBldmVudCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHQvLyBmaXJlIGV2ZW50IGZvciB0aGUgY29udGV4dC1pbmRleGVkIGxpc3RlbmVycyBhcyB3ZWxsXHJcblx0XHR0eXBlSW5kZXggPSBldmVudHNbdHlwZSArICdfaWR4J107XHJcblxyXG5cdFx0Zm9yIChjb250ZXh0SWQgaW4gdHlwZUluZGV4KSB7XHJcblx0XHRcdGxpc3RlbmVycyA9IHR5cGVJbmRleFtjb250ZXh0SWRdLnNsaWNlKCk7XHJcblxyXG5cdFx0XHRpZiAobGlzdGVuZXJzKSB7XHJcblx0XHRcdFx0Zm9yIChpID0gMCwgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0XHRsaXN0ZW5lcnNbaV0uYWN0aW9uLmNhbGwobGlzdGVuZXJzW2ldLmNvbnRleHQsIGV2ZW50KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRhZGRPbmVUaW1lRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24gKHR5cGVzLCBmbiwgY29udGV4dCkge1xyXG5cclxuXHRcdGlmIChMLlV0aWwuaW52b2tlRWFjaCh0eXBlcywgdGhpcy5hZGRPbmVUaW1lRXZlbnRMaXN0ZW5lciwgdGhpcywgZm4sIGNvbnRleHQpKSB7IHJldHVybiB0aGlzOyB9XHJcblxyXG5cdFx0dmFyIGhhbmRsZXIgPSBMLmJpbmQoZnVuY3Rpb24gKCkge1xyXG5cdFx0XHR0aGlzXHJcblx0XHRcdCAgICAucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlcywgZm4sIGNvbnRleHQpXHJcblx0XHRcdCAgICAucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlcywgaGFuZGxlciwgY29udGV4dCk7XHJcblx0XHR9LCB0aGlzKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpc1xyXG5cdFx0ICAgIC5hZGRFdmVudExpc3RlbmVyKHR5cGVzLCBmbiwgY29udGV4dClcclxuXHRcdCAgICAuYWRkRXZlbnRMaXN0ZW5lcih0eXBlcywgaGFuZGxlciwgY29udGV4dCk7XHJcblx0fVxyXG59O1xyXG5cclxuTC5NaXhpbi5FdmVudHMub24gPSBMLk1peGluLkV2ZW50cy5hZGRFdmVudExpc3RlbmVyO1xyXG5MLk1peGluLkV2ZW50cy5vZmYgPSBMLk1peGluLkV2ZW50cy5yZW1vdmVFdmVudExpc3RlbmVyO1xyXG5MLk1peGluLkV2ZW50cy5vbmNlID0gTC5NaXhpbi5FdmVudHMuYWRkT25lVGltZUV2ZW50TGlzdGVuZXI7XHJcbkwuTWl4aW4uRXZlbnRzLmZpcmUgPSBMLk1peGluLkV2ZW50cy5maXJlRXZlbnQ7XHJcblxuXG4vKlxyXG4gKiBMLkJyb3dzZXIgaGFuZGxlcyBkaWZmZXJlbnQgYnJvd3NlciBhbmQgZmVhdHVyZSBkZXRlY3Rpb25zIGZvciBpbnRlcm5hbCBMZWFmbGV0IHVzZS5cclxuICovXHJcblxyXG4oZnVuY3Rpb24gKCkge1xyXG5cclxuXHR2YXIgaWUgPSAnQWN0aXZlWE9iamVjdCcgaW4gd2luZG93LFxyXG5cdFx0aWVsdDkgPSBpZSAmJiAhZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcixcclxuXHJcblx0ICAgIC8vIHRlcnJpYmxlIGJyb3dzZXIgZGV0ZWN0aW9uIHRvIHdvcmsgYXJvdW5kIFNhZmFyaSAvIGlPUyAvIEFuZHJvaWQgYnJvd3NlciBidWdzXHJcblx0ICAgIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLFxyXG5cdCAgICB3ZWJraXQgPSB1YS5pbmRleE9mKCd3ZWJraXQnKSAhPT0gLTEsXHJcblx0ICAgIGNocm9tZSA9IHVhLmluZGV4T2YoJ2Nocm9tZScpICE9PSAtMSxcclxuXHQgICAgcGhhbnRvbWpzID0gdWEuaW5kZXhPZigncGhhbnRvbScpICE9PSAtMSxcclxuXHQgICAgYW5kcm9pZCA9IHVhLmluZGV4T2YoJ2FuZHJvaWQnKSAhPT0gLTEsXHJcblx0ICAgIGFuZHJvaWQyMyA9IHVhLnNlYXJjaCgnYW5kcm9pZCBbMjNdJykgIT09IC0xLFxyXG5cdFx0Z2Vja28gPSB1YS5pbmRleE9mKCdnZWNrbycpICE9PSAtMSxcclxuXHJcblx0ICAgIG1vYmlsZSA9IHR5cGVvZiBvcmllbnRhdGlvbiAhPT0gdW5kZWZpbmVkICsgJycsXHJcblx0ICAgIG1zUG9pbnRlciA9ICF3aW5kb3cuUG9pbnRlckV2ZW50ICYmIHdpbmRvdy5NU1BvaW50ZXJFdmVudCxcclxuXHRcdHBvaW50ZXIgPSAod2luZG93LlBvaW50ZXJFdmVudCAmJiB3aW5kb3cubmF2aWdhdG9yLnBvaW50ZXJFbmFibGVkICYmIHdpbmRvdy5uYXZpZ2F0b3IubWF4VG91Y2hQb2ludHMpIHx8XHJcblx0XHRcdFx0ICBtc1BvaW50ZXIsXHJcblx0ICAgIHJldGluYSA9ICgnZGV2aWNlUGl4ZWxSYXRpbycgaW4gd2luZG93ICYmIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvID4gMSkgfHxcclxuXHQgICAgICAgICAgICAgKCdtYXRjaE1lZGlhJyBpbiB3aW5kb3cgJiYgd2luZG93Lm1hdGNoTWVkaWEoJyhtaW4tcmVzb2x1dGlvbjoxNDRkcGkpJykgJiZcclxuXHQgICAgICAgICAgICAgIHdpbmRvdy5tYXRjaE1lZGlhKCcobWluLXJlc29sdXRpb246MTQ0ZHBpKScpLm1hdGNoZXMpLFxyXG5cclxuXHQgICAgZG9jID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LFxyXG5cdCAgICBpZTNkID0gaWUgJiYgKCd0cmFuc2l0aW9uJyBpbiBkb2Muc3R5bGUpLFxyXG5cdCAgICB3ZWJraXQzZCA9ICgnV2ViS2l0Q1NTTWF0cml4JyBpbiB3aW5kb3cpICYmICgnbTExJyBpbiBuZXcgd2luZG93LldlYktpdENTU01hdHJpeCgpKSAmJiAhYW5kcm9pZDIzLFxyXG5cdCAgICBnZWNrbzNkID0gJ01velBlcnNwZWN0aXZlJyBpbiBkb2Muc3R5bGUsXHJcblx0ICAgIG9wZXJhM2QgPSAnT1RyYW5zaXRpb24nIGluIGRvYy5zdHlsZSxcclxuXHQgICAgYW55M2QgPSAhd2luZG93LkxfRElTQUJMRV8zRCAmJiAoaWUzZCB8fCB3ZWJraXQzZCB8fCBnZWNrbzNkIHx8IG9wZXJhM2QpICYmICFwaGFudG9tanM7XHJcblxyXG5cdHZhciB0b3VjaCA9ICF3aW5kb3cuTF9OT19UT1VDSCAmJiAhcGhhbnRvbWpzICYmIChwb2ludGVyIHx8ICdvbnRvdWNoc3RhcnQnIGluIHdpbmRvdyB8fFxyXG5cdFx0KHdpbmRvdy5Eb2N1bWVudFRvdWNoICYmIGRvY3VtZW50IGluc3RhbmNlb2Ygd2luZG93LkRvY3VtZW50VG91Y2gpKTtcclxuXHJcblx0TC5Ccm93c2VyID0ge1xyXG5cdFx0aWU6IGllLFxyXG5cdFx0aWVsdDk6IGllbHQ5LFxyXG5cdFx0d2Via2l0OiB3ZWJraXQsXHJcblx0XHRnZWNrbzogZ2Vja28gJiYgIXdlYmtpdCAmJiAhd2luZG93Lm9wZXJhICYmICFpZSxcclxuXHJcblx0XHRhbmRyb2lkOiBhbmRyb2lkLFxyXG5cdFx0YW5kcm9pZDIzOiBhbmRyb2lkMjMsXHJcblxyXG5cdFx0Y2hyb21lOiBjaHJvbWUsXHJcblxyXG5cdFx0aWUzZDogaWUzZCxcclxuXHRcdHdlYmtpdDNkOiB3ZWJraXQzZCxcclxuXHRcdGdlY2tvM2Q6IGdlY2tvM2QsXHJcblx0XHRvcGVyYTNkOiBvcGVyYTNkLFxyXG5cdFx0YW55M2Q6IGFueTNkLFxyXG5cclxuXHRcdG1vYmlsZTogbW9iaWxlLFxyXG5cdFx0bW9iaWxlV2Via2l0OiBtb2JpbGUgJiYgd2Via2l0LFxyXG5cdFx0bW9iaWxlV2Via2l0M2Q6IG1vYmlsZSAmJiB3ZWJraXQzZCxcclxuXHRcdG1vYmlsZU9wZXJhOiBtb2JpbGUgJiYgd2luZG93Lm9wZXJhLFxyXG5cclxuXHRcdHRvdWNoOiB0b3VjaCxcclxuXHRcdG1zUG9pbnRlcjogbXNQb2ludGVyLFxyXG5cdFx0cG9pbnRlcjogcG9pbnRlcixcclxuXHJcblx0XHRyZXRpbmE6IHJldGluYVxyXG5cdH07XHJcblxyXG59KCkpO1xyXG5cblxuLypcclxuICogTC5Qb2ludCByZXByZXNlbnRzIGEgcG9pbnQgd2l0aCB4IGFuZCB5IGNvb3JkaW5hdGVzLlxyXG4gKi9cclxuXHJcbkwuUG9pbnQgPSBmdW5jdGlvbiAoLypOdW1iZXIqLyB4LCAvKk51bWJlciovIHksIC8qQm9vbGVhbiovIHJvdW5kKSB7XHJcblx0dGhpcy54ID0gKHJvdW5kID8gTWF0aC5yb3VuZCh4KSA6IHgpO1xyXG5cdHRoaXMueSA9IChyb3VuZCA/IE1hdGgucm91bmQoeSkgOiB5KTtcclxufTtcclxuXHJcbkwuUG9pbnQucHJvdG90eXBlID0ge1xyXG5cclxuXHRjbG9uZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KHRoaXMueCwgdGhpcy55KTtcclxuXHR9LFxyXG5cclxuXHQvLyBub24tZGVzdHJ1Y3RpdmUsIHJldHVybnMgYSBuZXcgcG9pbnRcclxuXHRhZGQ6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuY2xvbmUoKS5fYWRkKEwucG9pbnQocG9pbnQpKTtcclxuXHR9LFxyXG5cclxuXHQvLyBkZXN0cnVjdGl2ZSwgdXNlZCBkaXJlY3RseSBmb3IgcGVyZm9ybWFuY2UgaW4gc2l0dWF0aW9ucyB3aGVyZSBpdCdzIHNhZmUgdG8gbW9kaWZ5IGV4aXN0aW5nIHBvaW50XHJcblx0X2FkZDogZnVuY3Rpb24gKHBvaW50KSB7XHJcblx0XHR0aGlzLnggKz0gcG9pbnQueDtcclxuXHRcdHRoaXMueSArPSBwb2ludC55O1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0c3VidHJhY3Q6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuY2xvbmUoKS5fc3VidHJhY3QoTC5wb2ludChwb2ludCkpO1xyXG5cdH0sXHJcblxyXG5cdF9zdWJ0cmFjdDogZnVuY3Rpb24gKHBvaW50KSB7XHJcblx0XHR0aGlzLnggLT0gcG9pbnQueDtcclxuXHRcdHRoaXMueSAtPSBwb2ludC55O1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0ZGl2aWRlQnk6IGZ1bmN0aW9uIChudW0pIHtcclxuXHRcdHJldHVybiB0aGlzLmNsb25lKCkuX2RpdmlkZUJ5KG51bSk7XHJcblx0fSxcclxuXHJcblx0X2RpdmlkZUJ5OiBmdW5jdGlvbiAobnVtKSB7XHJcblx0XHR0aGlzLnggLz0gbnVtO1xyXG5cdFx0dGhpcy55IC89IG51bTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdG11bHRpcGx5Qnk6IGZ1bmN0aW9uIChudW0pIHtcclxuXHRcdHJldHVybiB0aGlzLmNsb25lKCkuX211bHRpcGx5QnkobnVtKTtcclxuXHR9LFxyXG5cclxuXHRfbXVsdGlwbHlCeTogZnVuY3Rpb24gKG51bSkge1xyXG5cdFx0dGhpcy54ICo9IG51bTtcclxuXHRcdHRoaXMueSAqPSBudW07XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRyb3VuZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuY2xvbmUoKS5fcm91bmQoKTtcclxuXHR9LFxyXG5cclxuXHRfcm91bmQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMueCA9IE1hdGgucm91bmQodGhpcy54KTtcclxuXHRcdHRoaXMueSA9IE1hdGgucm91bmQodGhpcy55KTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGZsb29yOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5jbG9uZSgpLl9mbG9vcigpO1xyXG5cdH0sXHJcblxyXG5cdF9mbG9vcjogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy54ID0gTWF0aC5mbG9vcih0aGlzLngpO1xyXG5cdFx0dGhpcy55ID0gTWF0aC5mbG9vcih0aGlzLnkpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0ZGlzdGFuY2VUbzogZnVuY3Rpb24gKHBvaW50KSB7XHJcblx0XHRwb2ludCA9IEwucG9pbnQocG9pbnQpO1xyXG5cclxuXHRcdHZhciB4ID0gcG9pbnQueCAtIHRoaXMueCxcclxuXHRcdCAgICB5ID0gcG9pbnQueSAtIHRoaXMueTtcclxuXHJcblx0XHRyZXR1cm4gTWF0aC5zcXJ0KHggKiB4ICsgeSAqIHkpO1xyXG5cdH0sXHJcblxyXG5cdGVxdWFsczogZnVuY3Rpb24gKHBvaW50KSB7XHJcblx0XHRwb2ludCA9IEwucG9pbnQocG9pbnQpO1xyXG5cclxuXHRcdHJldHVybiBwb2ludC54ID09PSB0aGlzLnggJiZcclxuXHRcdCAgICAgICBwb2ludC55ID09PSB0aGlzLnk7XHJcblx0fSxcclxuXHJcblx0Y29udGFpbnM6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0cG9pbnQgPSBMLnBvaW50KHBvaW50KTtcclxuXHJcblx0XHRyZXR1cm4gTWF0aC5hYnMocG9pbnQueCkgPD0gTWF0aC5hYnModGhpcy54KSAmJlxyXG5cdFx0ICAgICAgIE1hdGguYWJzKHBvaW50LnkpIDw9IE1hdGguYWJzKHRoaXMueSk7XHJcblx0fSxcclxuXHJcblx0dG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiAnUG9pbnQoJyArXHJcblx0XHQgICAgICAgIEwuVXRpbC5mb3JtYXROdW0odGhpcy54KSArICcsICcgK1xyXG5cdFx0ICAgICAgICBMLlV0aWwuZm9ybWF0TnVtKHRoaXMueSkgKyAnKSc7XHJcblx0fVxyXG59O1xyXG5cclxuTC5wb2ludCA9IGZ1bmN0aW9uICh4LCB5LCByb3VuZCkge1xyXG5cdGlmICh4IGluc3RhbmNlb2YgTC5Qb2ludCkge1xyXG5cdFx0cmV0dXJuIHg7XHJcblx0fVxyXG5cdGlmIChMLlV0aWwuaXNBcnJheSh4KSkge1xyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KHhbMF0sIHhbMV0pO1xyXG5cdH1cclxuXHRpZiAoeCA9PT0gdW5kZWZpbmVkIHx8IHggPT09IG51bGwpIHtcclxuXHRcdHJldHVybiB4O1xyXG5cdH1cclxuXHRyZXR1cm4gbmV3IEwuUG9pbnQoeCwgeSwgcm91bmQpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5Cb3VuZHMgcmVwcmVzZW50cyBhIHJlY3Rhbmd1bGFyIGFyZWEgb24gdGhlIHNjcmVlbiBpbiBwaXhlbCBjb29yZGluYXRlcy5cclxuICovXHJcblxyXG5MLkJvdW5kcyA9IGZ1bmN0aW9uIChhLCBiKSB7IC8vKFBvaW50LCBQb2ludCkgb3IgUG9pbnRbXVxyXG5cdGlmICghYSkgeyByZXR1cm47IH1cclxuXHJcblx0dmFyIHBvaW50cyA9IGIgPyBbYSwgYl0gOiBhO1xyXG5cclxuXHRmb3IgKHZhciBpID0gMCwgbGVuID0gcG9pbnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHR0aGlzLmV4dGVuZChwb2ludHNbaV0pO1xyXG5cdH1cclxufTtcclxuXHJcbkwuQm91bmRzLnByb3RvdHlwZSA9IHtcclxuXHQvLyBleHRlbmQgdGhlIGJvdW5kcyB0byBjb250YWluIHRoZSBnaXZlbiBwb2ludFxyXG5cdGV4dGVuZDogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludClcclxuXHRcdHBvaW50ID0gTC5wb2ludChwb2ludCk7XHJcblxyXG5cdFx0aWYgKCF0aGlzLm1pbiAmJiAhdGhpcy5tYXgpIHtcclxuXHRcdFx0dGhpcy5taW4gPSBwb2ludC5jbG9uZSgpO1xyXG5cdFx0XHR0aGlzLm1heCA9IHBvaW50LmNsb25lKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLm1pbi54ID0gTWF0aC5taW4ocG9pbnQueCwgdGhpcy5taW4ueCk7XHJcblx0XHRcdHRoaXMubWF4LnggPSBNYXRoLm1heChwb2ludC54LCB0aGlzLm1heC54KTtcclxuXHRcdFx0dGhpcy5taW4ueSA9IE1hdGgubWluKHBvaW50LnksIHRoaXMubWluLnkpO1xyXG5cdFx0XHR0aGlzLm1heC55ID0gTWF0aC5tYXgocG9pbnQueSwgdGhpcy5tYXgueSk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRnZXRDZW50ZXI6IGZ1bmN0aW9uIChyb3VuZCkgeyAvLyAoQm9vbGVhbikgLT4gUG9pbnRcclxuXHRcdHJldHVybiBuZXcgTC5Qb2ludChcclxuXHRcdCAgICAgICAgKHRoaXMubWluLnggKyB0aGlzLm1heC54KSAvIDIsXHJcblx0XHQgICAgICAgICh0aGlzLm1pbi55ICsgdGhpcy5tYXgueSkgLyAyLCByb3VuZCk7XHJcblx0fSxcclxuXHJcblx0Z2V0Qm90dG9tTGVmdDogZnVuY3Rpb24gKCkgeyAvLyAtPiBQb2ludFxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KHRoaXMubWluLngsIHRoaXMubWF4LnkpO1xyXG5cdH0sXHJcblxyXG5cdGdldFRvcFJpZ2h0OiBmdW5jdGlvbiAoKSB7IC8vIC0+IFBvaW50XHJcblx0XHRyZXR1cm4gbmV3IEwuUG9pbnQodGhpcy5tYXgueCwgdGhpcy5taW4ueSk7XHJcblx0fSxcclxuXHJcblx0Z2V0U2l6ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMubWF4LnN1YnRyYWN0KHRoaXMubWluKTtcclxuXHR9LFxyXG5cclxuXHRjb250YWluczogZnVuY3Rpb24gKG9iaikgeyAvLyAoQm91bmRzKSBvciAoUG9pbnQpIC0+IEJvb2xlYW5cclxuXHRcdHZhciBtaW4sIG1heDtcclxuXHJcblx0XHRpZiAodHlwZW9mIG9ialswXSA9PT0gJ251bWJlcicgfHwgb2JqIGluc3RhbmNlb2YgTC5Qb2ludCkge1xyXG5cdFx0XHRvYmogPSBMLnBvaW50KG9iaik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRvYmogPSBMLmJvdW5kcyhvYmopO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBMLkJvdW5kcykge1xyXG5cdFx0XHRtaW4gPSBvYmoubWluO1xyXG5cdFx0XHRtYXggPSBvYmoubWF4O1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0bWluID0gbWF4ID0gb2JqO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiAobWluLnggPj0gdGhpcy5taW4ueCkgJiZcclxuXHRcdCAgICAgICAobWF4LnggPD0gdGhpcy5tYXgueCkgJiZcclxuXHRcdCAgICAgICAobWluLnkgPj0gdGhpcy5taW4ueSkgJiZcclxuXHRcdCAgICAgICAobWF4LnkgPD0gdGhpcy5tYXgueSk7XHJcblx0fSxcclxuXHJcblx0aW50ZXJzZWN0czogZnVuY3Rpb24gKGJvdW5kcykgeyAvLyAoQm91bmRzKSAtPiBCb29sZWFuXHJcblx0XHRib3VuZHMgPSBMLmJvdW5kcyhib3VuZHMpO1xyXG5cclxuXHRcdHZhciBtaW4gPSB0aGlzLm1pbixcclxuXHRcdCAgICBtYXggPSB0aGlzLm1heCxcclxuXHRcdCAgICBtaW4yID0gYm91bmRzLm1pbixcclxuXHRcdCAgICBtYXgyID0gYm91bmRzLm1heCxcclxuXHRcdCAgICB4SW50ZXJzZWN0cyA9IChtYXgyLnggPj0gbWluLngpICYmIChtaW4yLnggPD0gbWF4LngpLFxyXG5cdFx0ICAgIHlJbnRlcnNlY3RzID0gKG1heDIueSA+PSBtaW4ueSkgJiYgKG1pbjIueSA8PSBtYXgueSk7XHJcblxyXG5cdFx0cmV0dXJuIHhJbnRlcnNlY3RzICYmIHlJbnRlcnNlY3RzO1xyXG5cdH0sXHJcblxyXG5cdGlzVmFsaWQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiAhISh0aGlzLm1pbiAmJiB0aGlzLm1heCk7XHJcblx0fVxyXG59O1xyXG5cclxuTC5ib3VuZHMgPSBmdW5jdGlvbiAoYSwgYikgeyAvLyAoQm91bmRzKSBvciAoUG9pbnQsIFBvaW50KSBvciAoUG9pbnRbXSlcclxuXHRpZiAoIWEgfHwgYSBpbnN0YW5jZW9mIEwuQm91bmRzKSB7XHJcblx0XHRyZXR1cm4gYTtcclxuXHR9XHJcblx0cmV0dXJuIG5ldyBMLkJvdW5kcyhhLCBiKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuVHJhbnNmb3JtYXRpb24gaXMgYW4gdXRpbGl0eSBjbGFzcyB0byBwZXJmb3JtIHNpbXBsZSBwb2ludCB0cmFuc2Zvcm1hdGlvbnMgdGhyb3VnaCBhIDJkLW1hdHJpeC5cclxuICovXHJcblxyXG5MLlRyYW5zZm9ybWF0aW9uID0gZnVuY3Rpb24gKGEsIGIsIGMsIGQpIHtcclxuXHR0aGlzLl9hID0gYTtcclxuXHR0aGlzLl9iID0gYjtcclxuXHR0aGlzLl9jID0gYztcclxuXHR0aGlzLl9kID0gZDtcclxufTtcclxuXHJcbkwuVHJhbnNmb3JtYXRpb24ucHJvdG90eXBlID0ge1xyXG5cdHRyYW5zZm9ybTogZnVuY3Rpb24gKHBvaW50LCBzY2FsZSkgeyAvLyAoUG9pbnQsIE51bWJlcikgLT4gUG9pbnRcclxuXHRcdHJldHVybiB0aGlzLl90cmFuc2Zvcm0ocG9pbnQuY2xvbmUoKSwgc2NhbGUpO1xyXG5cdH0sXHJcblxyXG5cdC8vIGRlc3RydWN0aXZlIHRyYW5zZm9ybSAoZmFzdGVyKVxyXG5cdF90cmFuc2Zvcm06IGZ1bmN0aW9uIChwb2ludCwgc2NhbGUpIHtcclxuXHRcdHNjYWxlID0gc2NhbGUgfHwgMTtcclxuXHRcdHBvaW50LnggPSBzY2FsZSAqICh0aGlzLl9hICogcG9pbnQueCArIHRoaXMuX2IpO1xyXG5cdFx0cG9pbnQueSA9IHNjYWxlICogKHRoaXMuX2MgKiBwb2ludC55ICsgdGhpcy5fZCk7XHJcblx0XHRyZXR1cm4gcG9pbnQ7XHJcblx0fSxcclxuXHJcblx0dW50cmFuc2Zvcm06IGZ1bmN0aW9uIChwb2ludCwgc2NhbGUpIHtcclxuXHRcdHNjYWxlID0gc2NhbGUgfHwgMTtcclxuXHRcdHJldHVybiBuZXcgTC5Qb2ludChcclxuXHRcdCAgICAgICAgKHBvaW50LnggLyBzY2FsZSAtIHRoaXMuX2IpIC8gdGhpcy5fYSxcclxuXHRcdCAgICAgICAgKHBvaW50LnkgLyBzY2FsZSAtIHRoaXMuX2QpIC8gdGhpcy5fYyk7XHJcblx0fVxyXG59O1xyXG5cblxuLypcclxuICogTC5Eb21VdGlsIGNvbnRhaW5zIHZhcmlvdXMgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIHdvcmtpbmcgd2l0aCBET00uXHJcbiAqL1xyXG5cclxuTC5Eb21VdGlsID0ge1xyXG5cdGdldDogZnVuY3Rpb24gKGlkKSB7XHJcblx0XHRyZXR1cm4gKHR5cGVvZiBpZCA9PT0gJ3N0cmluZycgPyBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCkgOiBpZCk7XHJcblx0fSxcclxuXHJcblx0Z2V0U3R5bGU6IGZ1bmN0aW9uIChlbCwgc3R5bGUpIHtcclxuXHJcblx0XHR2YXIgdmFsdWUgPSBlbC5zdHlsZVtzdHlsZV07XHJcblxyXG5cdFx0aWYgKCF2YWx1ZSAmJiBlbC5jdXJyZW50U3R5bGUpIHtcclxuXHRcdFx0dmFsdWUgPSBlbC5jdXJyZW50U3R5bGVbc3R5bGVdO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICgoIXZhbHVlIHx8IHZhbHVlID09PSAnYXV0bycpICYmIGRvY3VtZW50LmRlZmF1bHRWaWV3KSB7XHJcblx0XHRcdHZhciBjc3MgPSBkb2N1bWVudC5kZWZhdWx0Vmlldy5nZXRDb21wdXRlZFN0eWxlKGVsLCBudWxsKTtcclxuXHRcdFx0dmFsdWUgPSBjc3MgPyBjc3Nbc3R5bGVdIDogbnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdmFsdWUgPT09ICdhdXRvJyA/IG51bGwgOiB2YWx1ZTtcclxuXHR9LFxyXG5cclxuXHRnZXRWaWV3cG9ydE9mZnNldDogZnVuY3Rpb24gKGVsZW1lbnQpIHtcclxuXHJcblx0XHR2YXIgdG9wID0gMCxcclxuXHRcdCAgICBsZWZ0ID0gMCxcclxuXHRcdCAgICBlbCA9IGVsZW1lbnQsXHJcblx0XHQgICAgZG9jQm9keSA9IGRvY3VtZW50LmJvZHksXHJcblx0XHQgICAgZG9jRWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsXHJcblx0XHQgICAgcG9zO1xyXG5cclxuXHRcdGRvIHtcclxuXHRcdFx0dG9wICArPSBlbC5vZmZzZXRUb3AgIHx8IDA7XHJcblx0XHRcdGxlZnQgKz0gZWwub2Zmc2V0TGVmdCB8fCAwO1xyXG5cclxuXHRcdFx0Ly9hZGQgYm9yZGVyc1xyXG5cdFx0XHR0b3AgKz0gcGFyc2VJbnQoTC5Eb21VdGlsLmdldFN0eWxlKGVsLCAnYm9yZGVyVG9wV2lkdGgnKSwgMTApIHx8IDA7XHJcblx0XHRcdGxlZnQgKz0gcGFyc2VJbnQoTC5Eb21VdGlsLmdldFN0eWxlKGVsLCAnYm9yZGVyTGVmdFdpZHRoJyksIDEwKSB8fCAwO1xyXG5cclxuXHRcdFx0cG9zID0gTC5Eb21VdGlsLmdldFN0eWxlKGVsLCAncG9zaXRpb24nKTtcclxuXHJcblx0XHRcdGlmIChlbC5vZmZzZXRQYXJlbnQgPT09IGRvY0JvZHkgJiYgcG9zID09PSAnYWJzb2x1dGUnKSB7IGJyZWFrOyB9XHJcblxyXG5cdFx0XHRpZiAocG9zID09PSAnZml4ZWQnKSB7XHJcblx0XHRcdFx0dG9wICArPSBkb2NCb2R5LnNjcm9sbFRvcCAgfHwgZG9jRWwuc2Nyb2xsVG9wICB8fCAwO1xyXG5cdFx0XHRcdGxlZnQgKz0gZG9jQm9keS5zY3JvbGxMZWZ0IHx8IGRvY0VsLnNjcm9sbExlZnQgfHwgMDtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKHBvcyA9PT0gJ3JlbGF0aXZlJyAmJiAhZWwub2Zmc2V0TGVmdCkge1xyXG5cdFx0XHRcdHZhciB3aWR0aCA9IEwuRG9tVXRpbC5nZXRTdHlsZShlbCwgJ3dpZHRoJyksXHJcblx0XHRcdFx0ICAgIG1heFdpZHRoID0gTC5Eb21VdGlsLmdldFN0eWxlKGVsLCAnbWF4LXdpZHRoJyksXHJcblx0XHRcdFx0ICAgIHIgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuXHJcblx0XHRcdFx0aWYgKHdpZHRoICE9PSAnbm9uZScgfHwgbWF4V2lkdGggIT09ICdub25lJykge1xyXG5cdFx0XHRcdFx0bGVmdCArPSByLmxlZnQgKyBlbC5jbGllbnRMZWZ0O1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Ly9jYWxjdWxhdGUgZnVsbCB5IG9mZnNldCBzaW5jZSB3ZSdyZSBicmVha2luZyBvdXQgb2YgdGhlIGxvb3BcclxuXHRcdFx0XHR0b3AgKz0gci50b3AgKyAoZG9jQm9keS5zY3JvbGxUb3AgIHx8IGRvY0VsLnNjcm9sbFRvcCAgfHwgMCk7XHJcblxyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRlbCA9IGVsLm9mZnNldFBhcmVudDtcclxuXHJcblx0XHR9IHdoaWxlIChlbCk7XHJcblxyXG5cdFx0ZWwgPSBlbGVtZW50O1xyXG5cclxuXHRcdGRvIHtcclxuXHRcdFx0aWYgKGVsID09PSBkb2NCb2R5KSB7IGJyZWFrOyB9XHJcblxyXG5cdFx0XHR0b3AgIC09IGVsLnNjcm9sbFRvcCAgfHwgMDtcclxuXHRcdFx0bGVmdCAtPSBlbC5zY3JvbGxMZWZ0IHx8IDA7XHJcblxyXG5cdFx0XHRlbCA9IGVsLnBhcmVudE5vZGU7XHJcblx0XHR9IHdoaWxlIChlbCk7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KGxlZnQsIHRvcCk7XHJcblx0fSxcclxuXHJcblx0ZG9jdW1lbnRJc0x0cjogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCFMLkRvbVV0aWwuX2RvY0lzTHRyQ2FjaGVkKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5fZG9jSXNMdHJDYWNoZWQgPSB0cnVlO1xyXG5cdFx0XHRMLkRvbVV0aWwuX2RvY0lzTHRyID0gTC5Eb21VdGlsLmdldFN0eWxlKGRvY3VtZW50LmJvZHksICdkaXJlY3Rpb24nKSA9PT0gJ2x0cic7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gTC5Eb21VdGlsLl9kb2NJc0x0cjtcclxuXHR9LFxyXG5cclxuXHRjcmVhdGU6IGZ1bmN0aW9uICh0YWdOYW1lLCBjbGFzc05hbWUsIGNvbnRhaW5lcikge1xyXG5cclxuXHRcdHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XHJcblx0XHRlbC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XHJcblxyXG5cdFx0aWYgKGNvbnRhaW5lcikge1xyXG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWwpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBlbDtcclxuXHR9LFxyXG5cclxuXHRoYXNDbGFzczogZnVuY3Rpb24gKGVsLCBuYW1lKSB7XHJcblx0XHRpZiAoZWwuY2xhc3NMaXN0ICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0cmV0dXJuIGVsLmNsYXNzTGlzdC5jb250YWlucyhuYW1lKTtcclxuXHRcdH1cclxuXHRcdHZhciBjbGFzc05hbWUgPSBMLkRvbVV0aWwuX2dldENsYXNzKGVsKTtcclxuXHRcdHJldHVybiBjbGFzc05hbWUubGVuZ3RoID4gMCAmJiBuZXcgUmVnRXhwKCcoXnxcXFxccyknICsgbmFtZSArICcoXFxcXHN8JCknKS50ZXN0KGNsYXNzTmFtZSk7XHJcblx0fSxcclxuXHJcblx0YWRkQ2xhc3M6IGZ1bmN0aW9uIChlbCwgbmFtZSkge1xyXG5cdFx0aWYgKGVsLmNsYXNzTGlzdCAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHZhciBjbGFzc2VzID0gTC5VdGlsLnNwbGl0V29yZHMobmFtZSk7XHJcblx0XHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSBjbGFzc2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0ZWwuY2xhc3NMaXN0LmFkZChjbGFzc2VzW2ldKTtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIGlmICghTC5Eb21VdGlsLmhhc0NsYXNzKGVsLCBuYW1lKSkge1xyXG5cdFx0XHR2YXIgY2xhc3NOYW1lID0gTC5Eb21VdGlsLl9nZXRDbGFzcyhlbCk7XHJcblx0XHRcdEwuRG9tVXRpbC5fc2V0Q2xhc3MoZWwsIChjbGFzc05hbWUgPyBjbGFzc05hbWUgKyAnICcgOiAnJykgKyBuYW1lKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRyZW1vdmVDbGFzczogZnVuY3Rpb24gKGVsLCBuYW1lKSB7XHJcblx0XHRpZiAoZWwuY2xhc3NMaXN0ICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0ZWwuY2xhc3NMaXN0LnJlbW92ZShuYW1lKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdEwuRG9tVXRpbC5fc2V0Q2xhc3MoZWwsIEwuVXRpbC50cmltKCgnICcgKyBMLkRvbVV0aWwuX2dldENsYXNzKGVsKSArICcgJykucmVwbGFjZSgnICcgKyBuYW1lICsgJyAnLCAnICcpKSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X3NldENsYXNzOiBmdW5jdGlvbiAoZWwsIG5hbWUpIHtcclxuXHRcdGlmIChlbC5jbGFzc05hbWUuYmFzZVZhbCA9PT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdGVsLmNsYXNzTmFtZSA9IG5hbWU7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHQvLyBpbiBjYXNlIG9mIFNWRyBlbGVtZW50XHJcblx0XHRcdGVsLmNsYXNzTmFtZS5iYXNlVmFsID0gbmFtZTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfZ2V0Q2xhc3M6IGZ1bmN0aW9uIChlbCkge1xyXG5cdFx0cmV0dXJuIGVsLmNsYXNzTmFtZS5iYXNlVmFsID09PSB1bmRlZmluZWQgPyBlbC5jbGFzc05hbWUgOiBlbC5jbGFzc05hbWUuYmFzZVZhbDtcclxuXHR9LFxyXG5cclxuXHRzZXRPcGFjaXR5OiBmdW5jdGlvbiAoZWwsIHZhbHVlKSB7XHJcblxyXG5cdFx0aWYgKCdvcGFjaXR5JyBpbiBlbC5zdHlsZSkge1xyXG5cdFx0XHRlbC5zdHlsZS5vcGFjaXR5ID0gdmFsdWU7XHJcblxyXG5cdFx0fSBlbHNlIGlmICgnZmlsdGVyJyBpbiBlbC5zdHlsZSkge1xyXG5cclxuXHRcdFx0dmFyIGZpbHRlciA9IGZhbHNlLFxyXG5cdFx0XHQgICAgZmlsdGVyTmFtZSA9ICdEWEltYWdlVHJhbnNmb3JtLk1pY3Jvc29mdC5BbHBoYSc7XHJcblxyXG5cdFx0XHQvLyBmaWx0ZXJzIGNvbGxlY3Rpb24gdGhyb3dzIGFuIGVycm9yIGlmIHdlIHRyeSB0byByZXRyaWV2ZSBhIGZpbHRlciB0aGF0IGRvZXNuJ3QgZXhpc3RcclxuXHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRmaWx0ZXIgPSBlbC5maWx0ZXJzLml0ZW0oZmlsdGVyTmFtZSk7XHJcblx0XHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0XHQvLyBkb24ndCBzZXQgb3BhY2l0eSB0byAxIGlmIHdlIGhhdmVuJ3QgYWxyZWFkeSBzZXQgYW4gb3BhY2l0eSxcclxuXHRcdFx0XHQvLyBpdCBpc24ndCBuZWVkZWQgYW5kIGJyZWFrcyB0cmFuc3BhcmVudCBwbmdzLlxyXG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gMSkgeyByZXR1cm47IH1cclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFsdWUgPSBNYXRoLnJvdW5kKHZhbHVlICogMTAwKTtcclxuXHJcblx0XHRcdGlmIChmaWx0ZXIpIHtcclxuXHRcdFx0XHRmaWx0ZXIuRW5hYmxlZCA9ICh2YWx1ZSAhPT0gMTAwKTtcclxuXHRcdFx0XHRmaWx0ZXIuT3BhY2l0eSA9IHZhbHVlO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGVsLnN0eWxlLmZpbHRlciArPSAnIHByb2dpZDonICsgZmlsdGVyTmFtZSArICcob3BhY2l0eT0nICsgdmFsdWUgKyAnKSc7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHR0ZXN0UHJvcDogZnVuY3Rpb24gKHByb3BzKSB7XHJcblxyXG5cdFx0dmFyIHN0eWxlID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgcHJvcHMubGVuZ3RoOyBpKyspIHtcclxuXHRcdFx0aWYgKHByb3BzW2ldIGluIHN0eWxlKSB7XHJcblx0XHRcdFx0cmV0dXJuIHByb3BzW2ldO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZmFsc2U7XHJcblx0fSxcclxuXHJcblx0Z2V0VHJhbnNsYXRlU3RyaW5nOiBmdW5jdGlvbiAocG9pbnQpIHtcclxuXHRcdC8vIG9uIFdlYktpdCBicm93c2VycyAoQ2hyb21lL1NhZmFyaS9pT1MgU2FmYXJpL0FuZHJvaWQpIHVzaW5nIHRyYW5zbGF0ZTNkIGluc3RlYWQgb2YgdHJhbnNsYXRlXHJcblx0XHQvLyBtYWtlcyBhbmltYXRpb24gc21vb3RoZXIgYXMgaXQgZW5zdXJlcyBIVyBhY2NlbCBpcyB1c2VkLiBGaXJlZm94IDEzIGRvZXNuJ3QgY2FyZVxyXG5cdFx0Ly8gKHNhbWUgc3BlZWQgZWl0aGVyIHdheSksIE9wZXJhIDEyIGRvZXNuJ3Qgc3VwcG9ydCB0cmFuc2xhdGUzZFxyXG5cclxuXHRcdHZhciBpczNkID0gTC5Ccm93c2VyLndlYmtpdDNkLFxyXG5cdFx0ICAgIG9wZW4gPSAndHJhbnNsYXRlJyArIChpczNkID8gJzNkJyA6ICcnKSArICcoJyxcclxuXHRcdCAgICBjbG9zZSA9IChpczNkID8gJywwJyA6ICcnKSArICcpJztcclxuXHJcblx0XHRyZXR1cm4gb3BlbiArIHBvaW50LnggKyAncHgsJyArIHBvaW50LnkgKyAncHgnICsgY2xvc2U7XHJcblx0fSxcclxuXHJcblx0Z2V0U2NhbGVTdHJpbmc6IGZ1bmN0aW9uIChzY2FsZSwgb3JpZ2luKSB7XHJcblxyXG5cdFx0dmFyIHByZVRyYW5zbGF0ZVN0ciA9IEwuRG9tVXRpbC5nZXRUcmFuc2xhdGVTdHJpbmcob3JpZ2luLmFkZChvcmlnaW4ubXVsdGlwbHlCeSgtMSAqIHNjYWxlKSkpLFxyXG5cdFx0ICAgIHNjYWxlU3RyID0gJyBzY2FsZSgnICsgc2NhbGUgKyAnKSAnO1xyXG5cclxuXHRcdHJldHVybiBwcmVUcmFuc2xhdGVTdHIgKyBzY2FsZVN0cjtcclxuXHR9LFxyXG5cclxuXHRzZXRQb3NpdGlvbjogZnVuY3Rpb24gKGVsLCBwb2ludCwgZGlzYWJsZTNEKSB7IC8vIChIVE1MRWxlbWVudCwgUG9pbnRbLCBCb29sZWFuXSlcclxuXHJcblx0XHQvLyBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZVxyXG5cdFx0ZWwuX2xlYWZsZXRfcG9zID0gcG9pbnQ7XHJcblxyXG5cdFx0aWYgKCFkaXNhYmxlM0QgJiYgTC5Ccm93c2VyLmFueTNkKSB7XHJcblx0XHRcdGVsLnN0eWxlW0wuRG9tVXRpbC5UUkFOU0ZPUk1dID0gIEwuRG9tVXRpbC5nZXRUcmFuc2xhdGVTdHJpbmcocG9pbnQpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0ZWwuc3R5bGUubGVmdCA9IHBvaW50LnggKyAncHgnO1xyXG5cdFx0XHRlbC5zdHlsZS50b3AgPSBwb2ludC55ICsgJ3B4JztcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRnZXRQb3NpdGlvbjogZnVuY3Rpb24gKGVsKSB7XHJcblx0XHQvLyB0aGlzIG1ldGhvZCBpcyBvbmx5IHVzZWQgZm9yIGVsZW1lbnRzIHByZXZpb3VzbHkgcG9zaXRpb25lZCB1c2luZyBzZXRQb3NpdGlvbixcclxuXHRcdC8vIHNvIGl0J3Mgc2FmZSB0byBjYWNoZSB0aGUgcG9zaXRpb24gZm9yIHBlcmZvcm1hbmNlXHJcblxyXG5cdFx0Ly8ganNoaW50IGNhbWVsY2FzZTogZmFsc2VcclxuXHRcdHJldHVybiBlbC5fbGVhZmxldF9wb3M7XHJcblx0fVxyXG59O1xyXG5cclxuXHJcbi8vIHByZWZpeCBzdHlsZSBwcm9wZXJ0eSBuYW1lc1xyXG5cclxuTC5Eb21VdGlsLlRSQU5TRk9STSA9IEwuRG9tVXRpbC50ZXN0UHJvcChcclxuICAgICAgICBbJ3RyYW5zZm9ybScsICdXZWJraXRUcmFuc2Zvcm0nLCAnT1RyYW5zZm9ybScsICdNb3pUcmFuc2Zvcm0nLCAnbXNUcmFuc2Zvcm0nXSk7XHJcblxyXG4vLyB3ZWJraXRUcmFuc2l0aW9uIGNvbWVzIGZpcnN0IGJlY2F1c2Ugc29tZSBicm93c2VyIHZlcnNpb25zIHRoYXQgZHJvcCB2ZW5kb3IgcHJlZml4IGRvbid0IGRvXHJcbi8vIHRoZSBzYW1lIGZvciB0aGUgdHJhbnNpdGlvbmVuZCBldmVudCwgaW4gcGFydGljdWxhciB0aGUgQW5kcm9pZCA0LjEgc3RvY2sgYnJvd3NlclxyXG5cclxuTC5Eb21VdGlsLlRSQU5TSVRJT04gPSBMLkRvbVV0aWwudGVzdFByb3AoXHJcbiAgICAgICAgWyd3ZWJraXRUcmFuc2l0aW9uJywgJ3RyYW5zaXRpb24nLCAnT1RyYW5zaXRpb24nLCAnTW96VHJhbnNpdGlvbicsICdtc1RyYW5zaXRpb24nXSk7XHJcblxyXG5MLkRvbVV0aWwuVFJBTlNJVElPTl9FTkQgPVxyXG4gICAgICAgIEwuRG9tVXRpbC5UUkFOU0lUSU9OID09PSAnd2Via2l0VHJhbnNpdGlvbicgfHwgTC5Eb21VdGlsLlRSQU5TSVRJT04gPT09ICdPVHJhbnNpdGlvbicgP1xyXG4gICAgICAgIEwuRG9tVXRpbC5UUkFOU0lUSU9OICsgJ0VuZCcgOiAndHJhbnNpdGlvbmVuZCc7XHJcblxyXG4oZnVuY3Rpb24gKCkge1xyXG4gICAgaWYgKCdvbnNlbGVjdHN0YXJ0JyBpbiBkb2N1bWVudCkge1xyXG4gICAgICAgIEwuZXh0ZW5kKEwuRG9tVXRpbCwge1xyXG4gICAgICAgICAgICBkaXNhYmxlVGV4dFNlbGVjdGlvbjogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgTC5Eb21FdmVudC5vbih3aW5kb3csICdzZWxlY3RzdGFydCcsIEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQpO1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgZW5hYmxlVGV4dFNlbGVjdGlvbjogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgTC5Eb21FdmVudC5vZmYod2luZG93LCAnc2VsZWN0c3RhcnQnLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgdXNlclNlbGVjdFByb3BlcnR5ID0gTC5Eb21VdGlsLnRlc3RQcm9wKFxyXG4gICAgICAgICAgICBbJ3VzZXJTZWxlY3QnLCAnV2Via2l0VXNlclNlbGVjdCcsICdPVXNlclNlbGVjdCcsICdNb3pVc2VyU2VsZWN0JywgJ21zVXNlclNlbGVjdCddKTtcclxuXHJcbiAgICAgICAgTC5leHRlbmQoTC5Eb21VdGlsLCB7XHJcbiAgICAgICAgICAgIGRpc2FibGVUZXh0U2VsZWN0aW9uOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodXNlclNlbGVjdFByb3BlcnR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHN0eWxlID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3VzZXJTZWxlY3QgPSBzdHlsZVt1c2VyU2VsZWN0UHJvcGVydHldO1xyXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlW3VzZXJTZWxlY3RQcm9wZXJ0eV0gPSAnbm9uZSc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICBlbmFibGVUZXh0U2VsZWN0aW9uOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodXNlclNlbGVjdFByb3BlcnR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlW3VzZXJTZWxlY3RQcm9wZXJ0eV0gPSB0aGlzLl91c2VyU2VsZWN0O1xyXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl91c2VyU2VsZWN0O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG5cdEwuZXh0ZW5kKEwuRG9tVXRpbCwge1xyXG5cdFx0ZGlzYWJsZUltYWdlRHJhZzogZnVuY3Rpb24gKCkge1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9uKHdpbmRvdywgJ2RyYWdzdGFydCcsIEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQpO1xyXG5cdFx0fSxcclxuXHJcblx0XHRlbmFibGVJbWFnZURyYWc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0TC5Eb21FdmVudC5vZmYod2luZG93LCAnZHJhZ3N0YXJ0JywgTC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdCk7XHJcblx0XHR9XHJcblx0fSk7XHJcbn0pKCk7XHJcblxuXG4vKlxyXG4gKiBMLkxhdExuZyByZXByZXNlbnRzIGEgZ2VvZ3JhcGhpY2FsIHBvaW50IHdpdGggbGF0aXR1ZGUgYW5kIGxvbmdpdHVkZSBjb29yZGluYXRlcy5cclxuICovXHJcblxyXG5MLkxhdExuZyA9IGZ1bmN0aW9uIChsYXQsIGxuZywgYWx0KSB7IC8vIChOdW1iZXIsIE51bWJlciwgTnVtYmVyKVxyXG5cdGxhdCA9IHBhcnNlRmxvYXQobGF0KTtcclxuXHRsbmcgPSBwYXJzZUZsb2F0KGxuZyk7XHJcblxyXG5cdGlmIChpc05hTihsYXQpIHx8IGlzTmFOKGxuZykpIHtcclxuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBMYXRMbmcgb2JqZWN0OiAoJyArIGxhdCArICcsICcgKyBsbmcgKyAnKScpO1xyXG5cdH1cclxuXHJcblx0dGhpcy5sYXQgPSBsYXQ7XHJcblx0dGhpcy5sbmcgPSBsbmc7XHJcblxyXG5cdGlmIChhbHQgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0dGhpcy5hbHQgPSBwYXJzZUZsb2F0KGFsdCk7XHJcblx0fVxyXG59O1xyXG5cclxuTC5leHRlbmQoTC5MYXRMbmcsIHtcclxuXHRERUdfVE9fUkFEOiBNYXRoLlBJIC8gMTgwLFxyXG5cdFJBRF9UT19ERUc6IDE4MCAvIE1hdGguUEksXHJcblx0TUFYX01BUkdJTjogMS4wRS05IC8vIG1heCBtYXJnaW4gb2YgZXJyb3IgZm9yIHRoZSBcImVxdWFsc1wiIGNoZWNrXHJcbn0pO1xyXG5cclxuTC5MYXRMbmcucHJvdG90eXBlID0ge1xyXG5cdGVxdWFsczogZnVuY3Rpb24gKG9iaikgeyAvLyAoTGF0TG5nKSAtPiBCb29sZWFuXHJcblx0XHRpZiAoIW9iaikgeyByZXR1cm4gZmFsc2U7IH1cclxuXHJcblx0XHRvYmogPSBMLmxhdExuZyhvYmopO1xyXG5cclxuXHRcdHZhciBtYXJnaW4gPSBNYXRoLm1heChcclxuXHRcdCAgICAgICAgTWF0aC5hYnModGhpcy5sYXQgLSBvYmoubGF0KSxcclxuXHRcdCAgICAgICAgTWF0aC5hYnModGhpcy5sbmcgLSBvYmoubG5nKSk7XHJcblxyXG5cdFx0cmV0dXJuIG1hcmdpbiA8PSBMLkxhdExuZy5NQVhfTUFSR0lOO1xyXG5cdH0sXHJcblxyXG5cdHRvU3RyaW5nOiBmdW5jdGlvbiAocHJlY2lzaW9uKSB7IC8vIChOdW1iZXIpIC0+IFN0cmluZ1xyXG5cdFx0cmV0dXJuICdMYXRMbmcoJyArXHJcblx0XHQgICAgICAgIEwuVXRpbC5mb3JtYXROdW0odGhpcy5sYXQsIHByZWNpc2lvbikgKyAnLCAnICtcclxuXHRcdCAgICAgICAgTC5VdGlsLmZvcm1hdE51bSh0aGlzLmxuZywgcHJlY2lzaW9uKSArICcpJztcclxuXHR9LFxyXG5cclxuXHQvLyBIYXZlcnNpbmUgZGlzdGFuY2UgZm9ybXVsYSwgc2VlIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvSGF2ZXJzaW5lX2Zvcm11bGFcclxuXHQvLyBUT0RPIG1vdmUgdG8gcHJvamVjdGlvbiBjb2RlLCBMYXRMbmcgc2hvdWxkbid0IGtub3cgYWJvdXQgRWFydGhcclxuXHRkaXN0YW5jZVRvOiBmdW5jdGlvbiAob3RoZXIpIHsgLy8gKExhdExuZykgLT4gTnVtYmVyXHJcblx0XHRvdGhlciA9IEwubGF0TG5nKG90aGVyKTtcclxuXHJcblx0XHR2YXIgUiA9IDYzNzgxMzcsIC8vIGVhcnRoIHJhZGl1cyBpbiBtZXRlcnNcclxuXHRcdCAgICBkMnIgPSBMLkxhdExuZy5ERUdfVE9fUkFELFxyXG5cdFx0ICAgIGRMYXQgPSAob3RoZXIubGF0IC0gdGhpcy5sYXQpICogZDJyLFxyXG5cdFx0ICAgIGRMb24gPSAob3RoZXIubG5nIC0gdGhpcy5sbmcpICogZDJyLFxyXG5cdFx0ICAgIGxhdDEgPSB0aGlzLmxhdCAqIGQycixcclxuXHRcdCAgICBsYXQyID0gb3RoZXIubGF0ICogZDJyLFxyXG5cdFx0ICAgIHNpbjEgPSBNYXRoLnNpbihkTGF0IC8gMiksXHJcblx0XHQgICAgc2luMiA9IE1hdGguc2luKGRMb24gLyAyKTtcclxuXHJcblx0XHR2YXIgYSA9IHNpbjEgKiBzaW4xICsgc2luMiAqIHNpbjIgKiBNYXRoLmNvcyhsYXQxKSAqIE1hdGguY29zKGxhdDIpO1xyXG5cclxuXHRcdHJldHVybiBSICogMiAqIE1hdGguYXRhbjIoTWF0aC5zcXJ0KGEpLCBNYXRoLnNxcnQoMSAtIGEpKTtcclxuXHR9LFxyXG5cclxuXHR3cmFwOiBmdW5jdGlvbiAoYSwgYikgeyAvLyAoTnVtYmVyLCBOdW1iZXIpIC0+IExhdExuZ1xyXG5cdFx0dmFyIGxuZyA9IHRoaXMubG5nO1xyXG5cclxuXHRcdGEgPSBhIHx8IC0xODA7XHJcblx0XHRiID0gYiB8fCAgMTgwO1xyXG5cclxuXHRcdGxuZyA9IChsbmcgKyBiKSAlIChiIC0gYSkgKyAobG5nIDwgYSB8fCBsbmcgPT09IGIgPyBiIDogYSk7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZyh0aGlzLmxhdCwgbG5nKTtcclxuXHR9XHJcbn07XHJcblxyXG5MLmxhdExuZyA9IGZ1bmN0aW9uIChhLCBiKSB7IC8vIChMYXRMbmcpIG9yIChbTnVtYmVyLCBOdW1iZXJdKSBvciAoTnVtYmVyLCBOdW1iZXIpXHJcblx0aWYgKGEgaW5zdGFuY2VvZiBMLkxhdExuZykge1xyXG5cdFx0cmV0dXJuIGE7XHJcblx0fVxyXG5cdGlmIChMLlV0aWwuaXNBcnJheShhKSkge1xyXG5cdFx0aWYgKHR5cGVvZiBhWzBdID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgYVswXSA9PT0gJ3N0cmluZycpIHtcclxuXHRcdFx0cmV0dXJuIG5ldyBMLkxhdExuZyhhWzBdLCBhWzFdLCBhWzJdKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHJldHVybiBudWxsO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRpZiAoYSA9PT0gdW5kZWZpbmVkIHx8IGEgPT09IG51bGwpIHtcclxuXHRcdHJldHVybiBhO1xyXG5cdH1cclxuXHRpZiAodHlwZW9mIGEgPT09ICdvYmplY3QnICYmICdsYXQnIGluIGEpIHtcclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmcoYS5sYXQsICdsbmcnIGluIGEgPyBhLmxuZyA6IGEubG9uKTtcclxuXHR9XHJcblx0aWYgKGIgPT09IHVuZGVmaW5lZCkge1xyXG5cdFx0cmV0dXJuIG51bGw7XHJcblx0fVxyXG5cdHJldHVybiBuZXcgTC5MYXRMbmcoYSwgYik7XHJcbn07XHJcblxyXG5cblxuLypcclxuICogTC5MYXRMbmdCb3VuZHMgcmVwcmVzZW50cyBhIHJlY3Rhbmd1bGFyIGFyZWEgb24gdGhlIG1hcCBpbiBnZW9ncmFwaGljYWwgY29vcmRpbmF0ZXMuXHJcbiAqL1xyXG5cclxuTC5MYXRMbmdCb3VuZHMgPSBmdW5jdGlvbiAoc291dGhXZXN0LCBub3J0aEVhc3QpIHsgLy8gKExhdExuZywgTGF0TG5nKSBvciAoTGF0TG5nW10pXHJcblx0aWYgKCFzb3V0aFdlc3QpIHsgcmV0dXJuOyB9XHJcblxyXG5cdHZhciBsYXRsbmdzID0gbm9ydGhFYXN0ID8gW3NvdXRoV2VzdCwgbm9ydGhFYXN0XSA6IHNvdXRoV2VzdDtcclxuXHJcblx0Zm9yICh2YXIgaSA9IDAsIGxlbiA9IGxhdGxuZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdHRoaXMuZXh0ZW5kKGxhdGxuZ3NbaV0pO1xyXG5cdH1cclxufTtcclxuXHJcbkwuTGF0TG5nQm91bmRzLnByb3RvdHlwZSA9IHtcclxuXHQvLyBleHRlbmQgdGhlIGJvdW5kcyB0byBjb250YWluIHRoZSBnaXZlbiBwb2ludCBvciBib3VuZHNcclxuXHRleHRlbmQ6IGZ1bmN0aW9uIChvYmopIHsgLy8gKExhdExuZykgb3IgKExhdExuZ0JvdW5kcylcclxuXHRcdGlmICghb2JqKSB7IHJldHVybiB0aGlzOyB9XHJcblxyXG5cdFx0dmFyIGxhdExuZyA9IEwubGF0TG5nKG9iaik7XHJcblx0XHRpZiAobGF0TG5nICE9PSBudWxsKSB7XHJcblx0XHRcdG9iaiA9IGxhdExuZztcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdG9iaiA9IEwubGF0TG5nQm91bmRzKG9iaik7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEwuTGF0TG5nKSB7XHJcblx0XHRcdGlmICghdGhpcy5fc291dGhXZXN0ICYmICF0aGlzLl9ub3J0aEVhc3QpIHtcclxuXHRcdFx0XHR0aGlzLl9zb3V0aFdlc3QgPSBuZXcgTC5MYXRMbmcob2JqLmxhdCwgb2JqLmxuZyk7XHJcblx0XHRcdFx0dGhpcy5fbm9ydGhFYXN0ID0gbmV3IEwuTGF0TG5nKG9iai5sYXQsIG9iai5sbmcpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHRoaXMuX3NvdXRoV2VzdC5sYXQgPSBNYXRoLm1pbihvYmoubGF0LCB0aGlzLl9zb3V0aFdlc3QubGF0KTtcclxuXHRcdFx0XHR0aGlzLl9zb3V0aFdlc3QubG5nID0gTWF0aC5taW4ob2JqLmxuZywgdGhpcy5fc291dGhXZXN0LmxuZyk7XHJcblxyXG5cdFx0XHRcdHRoaXMuX25vcnRoRWFzdC5sYXQgPSBNYXRoLm1heChvYmoubGF0LCB0aGlzLl9ub3J0aEVhc3QubGF0KTtcclxuXHRcdFx0XHR0aGlzLl9ub3J0aEVhc3QubG5nID0gTWF0aC5tYXgob2JqLmxuZywgdGhpcy5fbm9ydGhFYXN0LmxuZyk7XHJcblx0XHRcdH1cclxuXHRcdH0gZWxzZSBpZiAob2JqIGluc3RhbmNlb2YgTC5MYXRMbmdCb3VuZHMpIHtcclxuXHRcdFx0dGhpcy5leHRlbmQob2JqLl9zb3V0aFdlc3QpO1xyXG5cdFx0XHR0aGlzLmV4dGVuZChvYmouX25vcnRoRWFzdCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHQvLyBleHRlbmQgdGhlIGJvdW5kcyBieSBhIHBlcmNlbnRhZ2VcclxuXHRwYWQ6IGZ1bmN0aW9uIChidWZmZXJSYXRpbykgeyAvLyAoTnVtYmVyKSAtPiBMYXRMbmdCb3VuZHNcclxuXHRcdHZhciBzdyA9IHRoaXMuX3NvdXRoV2VzdCxcclxuXHRcdCAgICBuZSA9IHRoaXMuX25vcnRoRWFzdCxcclxuXHRcdCAgICBoZWlnaHRCdWZmZXIgPSBNYXRoLmFicyhzdy5sYXQgLSBuZS5sYXQpICogYnVmZmVyUmF0aW8sXHJcblx0XHQgICAgd2lkdGhCdWZmZXIgPSBNYXRoLmFicyhzdy5sbmcgLSBuZS5sbmcpICogYnVmZmVyUmF0aW87XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZ0JvdW5kcyhcclxuXHRcdCAgICAgICAgbmV3IEwuTGF0TG5nKHN3LmxhdCAtIGhlaWdodEJ1ZmZlciwgc3cubG5nIC0gd2lkdGhCdWZmZXIpLFxyXG5cdFx0ICAgICAgICBuZXcgTC5MYXRMbmcobmUubGF0ICsgaGVpZ2h0QnVmZmVyLCBuZS5sbmcgKyB3aWR0aEJ1ZmZlcikpO1xyXG5cdH0sXHJcblxyXG5cdGdldENlbnRlcjogZnVuY3Rpb24gKCkgeyAvLyAtPiBMYXRMbmdcclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmcoXHJcblx0XHQgICAgICAgICh0aGlzLl9zb3V0aFdlc3QubGF0ICsgdGhpcy5fbm9ydGhFYXN0LmxhdCkgLyAyLFxyXG5cdFx0ICAgICAgICAodGhpcy5fc291dGhXZXN0LmxuZyArIHRoaXMuX25vcnRoRWFzdC5sbmcpIC8gMik7XHJcblx0fSxcclxuXHJcblx0Z2V0U291dGhXZXN0OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fc291dGhXZXN0O1xyXG5cdH0sXHJcblxyXG5cdGdldE5vcnRoRWFzdDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX25vcnRoRWFzdDtcclxuXHR9LFxyXG5cclxuXHRnZXROb3J0aFdlc3Q6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmcodGhpcy5nZXROb3J0aCgpLCB0aGlzLmdldFdlc3QoKSk7XHJcblx0fSxcclxuXHJcblx0Z2V0U291dGhFYXN0OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nKHRoaXMuZ2V0U291dGgoKSwgdGhpcy5nZXRFYXN0KCkpO1xyXG5cdH0sXHJcblxyXG5cdGdldFdlc3Q6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9zb3V0aFdlc3QubG5nO1xyXG5cdH0sXHJcblxyXG5cdGdldFNvdXRoOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fc291dGhXZXN0LmxhdDtcclxuXHR9LFxyXG5cclxuXHRnZXRFYXN0OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbm9ydGhFYXN0LmxuZztcclxuXHR9LFxyXG5cclxuXHRnZXROb3J0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX25vcnRoRWFzdC5sYXQ7XHJcblx0fSxcclxuXHJcblx0Y29udGFpbnM6IGZ1bmN0aW9uIChvYmopIHsgLy8gKExhdExuZ0JvdW5kcykgb3IgKExhdExuZykgLT4gQm9vbGVhblxyXG5cdFx0aWYgKHR5cGVvZiBvYmpbMF0gPT09ICdudW1iZXInIHx8IG9iaiBpbnN0YW5jZW9mIEwuTGF0TG5nKSB7XHJcblx0XHRcdG9iaiA9IEwubGF0TG5nKG9iaik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRvYmogPSBMLmxhdExuZ0JvdW5kcyhvYmopO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBzdyA9IHRoaXMuX3NvdXRoV2VzdCxcclxuXHRcdCAgICBuZSA9IHRoaXMuX25vcnRoRWFzdCxcclxuXHRcdCAgICBzdzIsIG5lMjtcclxuXHJcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgTC5MYXRMbmdCb3VuZHMpIHtcclxuXHRcdFx0c3cyID0gb2JqLmdldFNvdXRoV2VzdCgpO1xyXG5cdFx0XHRuZTIgPSBvYmouZ2V0Tm9ydGhFYXN0KCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRzdzIgPSBuZTIgPSBvYmo7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIChzdzIubGF0ID49IHN3LmxhdCkgJiYgKG5lMi5sYXQgPD0gbmUubGF0KSAmJlxyXG5cdFx0ICAgICAgIChzdzIubG5nID49IHN3LmxuZykgJiYgKG5lMi5sbmcgPD0gbmUubG5nKTtcclxuXHR9LFxyXG5cclxuXHRpbnRlcnNlY3RzOiBmdW5jdGlvbiAoYm91bmRzKSB7IC8vIChMYXRMbmdCb3VuZHMpXHJcblx0XHRib3VuZHMgPSBMLmxhdExuZ0JvdW5kcyhib3VuZHMpO1xyXG5cclxuXHRcdHZhciBzdyA9IHRoaXMuX3NvdXRoV2VzdCxcclxuXHRcdCAgICBuZSA9IHRoaXMuX25vcnRoRWFzdCxcclxuXHRcdCAgICBzdzIgPSBib3VuZHMuZ2V0U291dGhXZXN0KCksXHJcblx0XHQgICAgbmUyID0gYm91bmRzLmdldE5vcnRoRWFzdCgpLFxyXG5cclxuXHRcdCAgICBsYXRJbnRlcnNlY3RzID0gKG5lMi5sYXQgPj0gc3cubGF0KSAmJiAoc3cyLmxhdCA8PSBuZS5sYXQpLFxyXG5cdFx0ICAgIGxuZ0ludGVyc2VjdHMgPSAobmUyLmxuZyA+PSBzdy5sbmcpICYmIChzdzIubG5nIDw9IG5lLmxuZyk7XHJcblxyXG5cdFx0cmV0dXJuIGxhdEludGVyc2VjdHMgJiYgbG5nSW50ZXJzZWN0cztcclxuXHR9LFxyXG5cclxuXHR0b0JCb3hTdHJpbmc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiBbdGhpcy5nZXRXZXN0KCksIHRoaXMuZ2V0U291dGgoKSwgdGhpcy5nZXRFYXN0KCksIHRoaXMuZ2V0Tm9ydGgoKV0uam9pbignLCcpO1xyXG5cdH0sXHJcblxyXG5cdGVxdWFsczogZnVuY3Rpb24gKGJvdW5kcykgeyAvLyAoTGF0TG5nQm91bmRzKVxyXG5cdFx0aWYgKCFib3VuZHMpIHsgcmV0dXJuIGZhbHNlOyB9XHJcblxyXG5cdFx0Ym91bmRzID0gTC5sYXRMbmdCb3VuZHMoYm91bmRzKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fc291dGhXZXN0LmVxdWFscyhib3VuZHMuZ2V0U291dGhXZXN0KCkpICYmXHJcblx0XHQgICAgICAgdGhpcy5fbm9ydGhFYXN0LmVxdWFscyhib3VuZHMuZ2V0Tm9ydGhFYXN0KCkpO1xyXG5cdH0sXHJcblxyXG5cdGlzVmFsaWQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiAhISh0aGlzLl9zb3V0aFdlc3QgJiYgdGhpcy5fbm9ydGhFYXN0KTtcclxuXHR9XHJcbn07XHJcblxyXG4vL1RPRE8gSW50ZXJuYXRpb25hbCBkYXRlIGxpbmU/XHJcblxyXG5MLmxhdExuZ0JvdW5kcyA9IGZ1bmN0aW9uIChhLCBiKSB7IC8vIChMYXRMbmdCb3VuZHMpIG9yIChMYXRMbmcsIExhdExuZylcclxuXHRpZiAoIWEgfHwgYSBpbnN0YW5jZW9mIEwuTGF0TG5nQm91bmRzKSB7XHJcblx0XHRyZXR1cm4gYTtcclxuXHR9XHJcblx0cmV0dXJuIG5ldyBMLkxhdExuZ0JvdW5kcyhhLCBiKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuUHJvamVjdGlvbiBjb250YWlucyB2YXJpb3VzIGdlb2dyYXBoaWNhbCBwcm9qZWN0aW9ucyB1c2VkIGJ5IENSUyBjbGFzc2VzLlxyXG4gKi9cclxuXHJcbkwuUHJvamVjdGlvbiA9IHt9O1xyXG5cblxuLypcclxuICogU3BoZXJpY2FsIE1lcmNhdG9yIGlzIHRoZSBtb3N0IHBvcHVsYXIgbWFwIHByb2plY3Rpb24sIHVzZWQgYnkgRVBTRzozODU3IENSUyB1c2VkIGJ5IGRlZmF1bHQuXHJcbiAqL1xyXG5cclxuTC5Qcm9qZWN0aW9uLlNwaGVyaWNhbE1lcmNhdG9yID0ge1xyXG5cdE1BWF9MQVRJVFVERTogODUuMDUxMTI4Nzc5OCxcclxuXHJcblx0cHJvamVjdDogZnVuY3Rpb24gKGxhdGxuZykgeyAvLyAoTGF0TG5nKSAtPiBQb2ludFxyXG5cdFx0dmFyIGQgPSBMLkxhdExuZy5ERUdfVE9fUkFELFxyXG5cdFx0ICAgIG1heCA9IHRoaXMuTUFYX0xBVElUVURFLFxyXG5cdFx0ICAgIGxhdCA9IE1hdGgubWF4KE1hdGgubWluKG1heCwgbGF0bG5nLmxhdCksIC1tYXgpLFxyXG5cdFx0ICAgIHggPSBsYXRsbmcubG5nICogZCxcclxuXHRcdCAgICB5ID0gbGF0ICogZDtcclxuXHJcblx0XHR5ID0gTWF0aC5sb2coTWF0aC50YW4oKE1hdGguUEkgLyA0KSArICh5IC8gMikpKTtcclxuXHJcblx0XHRyZXR1cm4gbmV3IEwuUG9pbnQoeCwgeSk7XHJcblx0fSxcclxuXHJcblx0dW5wcm9qZWN0OiBmdW5jdGlvbiAocG9pbnQpIHsgLy8gKFBvaW50LCBCb29sZWFuKSAtPiBMYXRMbmdcclxuXHRcdHZhciBkID0gTC5MYXRMbmcuUkFEX1RPX0RFRyxcclxuXHRcdCAgICBsbmcgPSBwb2ludC54ICogZCxcclxuXHRcdCAgICBsYXQgPSAoMiAqIE1hdGguYXRhbihNYXRoLmV4cChwb2ludC55KSkgLSAoTWF0aC5QSSAvIDIpKSAqIGQ7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZyhsYXQsIGxuZyk7XHJcblx0fVxyXG59O1xyXG5cblxuLypcclxuICogU2ltcGxlIGVxdWlyZWN0YW5ndWxhciAoUGxhdGUgQ2FycmVlKSBwcm9qZWN0aW9uLCB1c2VkIGJ5IENSUyBsaWtlIEVQU0c6NDMyNiBhbmQgU2ltcGxlLlxyXG4gKi9cclxuXHJcbkwuUHJvamVjdGlvbi5Mb25MYXQgPSB7XHJcblx0cHJvamVjdDogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KGxhdGxuZy5sbmcsIGxhdGxuZy5sYXQpO1xyXG5cdH0sXHJcblxyXG5cdHVucHJvamVjdDogZnVuY3Rpb24gKHBvaW50KSB7XHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nKHBvaW50LnksIHBvaW50LngpO1xyXG5cdH1cclxufTtcclxuXG5cbi8qXHJcbiAqIEwuQ1JTIGlzIGEgYmFzZSBvYmplY3QgZm9yIGFsbCBkZWZpbmVkIENSUyAoQ29vcmRpbmF0ZSBSZWZlcmVuY2UgU3lzdGVtcykgaW4gTGVhZmxldC5cclxuICovXHJcblxyXG5MLkNSUyA9IHtcclxuXHRsYXRMbmdUb1BvaW50OiBmdW5jdGlvbiAobGF0bG5nLCB6b29tKSB7IC8vIChMYXRMbmcsIE51bWJlcikgLT4gUG9pbnRcclxuXHRcdHZhciBwcm9qZWN0ZWRQb2ludCA9IHRoaXMucHJvamVjdGlvbi5wcm9qZWN0KGxhdGxuZyksXHJcblx0XHQgICAgc2NhbGUgPSB0aGlzLnNjYWxlKHpvb20pO1xyXG5cclxuXHRcdHJldHVybiB0aGlzLnRyYW5zZm9ybWF0aW9uLl90cmFuc2Zvcm0ocHJvamVjdGVkUG9pbnQsIHNjYWxlKTtcclxuXHR9LFxyXG5cclxuXHRwb2ludFRvTGF0TG5nOiBmdW5jdGlvbiAocG9pbnQsIHpvb20pIHsgLy8gKFBvaW50LCBOdW1iZXJbLCBCb29sZWFuXSkgLT4gTGF0TG5nXHJcblx0XHR2YXIgc2NhbGUgPSB0aGlzLnNjYWxlKHpvb20pLFxyXG5cdFx0ICAgIHVudHJhbnNmb3JtZWRQb2ludCA9IHRoaXMudHJhbnNmb3JtYXRpb24udW50cmFuc2Zvcm0ocG9pbnQsIHNjYWxlKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5wcm9qZWN0aW9uLnVucHJvamVjdCh1bnRyYW5zZm9ybWVkUG9pbnQpO1xyXG5cdH0sXHJcblxyXG5cdHByb2plY3Q6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdHJldHVybiB0aGlzLnByb2plY3Rpb24ucHJvamVjdChsYXRsbmcpO1xyXG5cdH0sXHJcblxyXG5cdHNjYWxlOiBmdW5jdGlvbiAoem9vbSkge1xyXG5cdFx0cmV0dXJuIDI1NiAqIE1hdGgucG93KDIsIHpvb20pO1xyXG5cdH0sXHJcblxyXG5cdGdldFNpemU6IGZ1bmN0aW9uICh6b29tKSB7XHJcblx0XHR2YXIgcyA9IHRoaXMuc2NhbGUoem9vbSk7XHJcblx0XHRyZXR1cm4gTC5wb2ludChzLCBzKTtcclxuXHR9XHJcbn07XHJcblxuXG4vKlxuICogQSBzaW1wbGUgQ1JTIHRoYXQgY2FuIGJlIHVzZWQgZm9yIGZsYXQgbm9uLUVhcnRoIG1hcHMgbGlrZSBwYW5vcmFtYXMgb3IgZ2FtZSBtYXBzLlxuICovXG5cbkwuQ1JTLlNpbXBsZSA9IEwuZXh0ZW5kKHt9LCBMLkNSUywge1xuXHRwcm9qZWN0aW9uOiBMLlByb2plY3Rpb24uTG9uTGF0LFxuXHR0cmFuc2Zvcm1hdGlvbjogbmV3IEwuVHJhbnNmb3JtYXRpb24oMSwgMCwgLTEsIDApLFxuXG5cdHNjYWxlOiBmdW5jdGlvbiAoem9vbSkge1xuXHRcdHJldHVybiBNYXRoLnBvdygyLCB6b29tKTtcblx0fVxufSk7XG5cblxuLypcclxuICogTC5DUlMuRVBTRzM4NTcgKFNwaGVyaWNhbCBNZXJjYXRvcikgaXMgdGhlIG1vc3QgY29tbW9uIENSUyBmb3Igd2ViIG1hcHBpbmdcclxuICogYW5kIGlzIHVzZWQgYnkgTGVhZmxldCBieSBkZWZhdWx0LlxyXG4gKi9cclxuXHJcbkwuQ1JTLkVQU0czODU3ID0gTC5leHRlbmQoe30sIEwuQ1JTLCB7XHJcblx0Y29kZTogJ0VQU0c6Mzg1NycsXHJcblxyXG5cdHByb2plY3Rpb246IEwuUHJvamVjdGlvbi5TcGhlcmljYWxNZXJjYXRvcixcclxuXHR0cmFuc2Zvcm1hdGlvbjogbmV3IEwuVHJhbnNmb3JtYXRpb24oMC41IC8gTWF0aC5QSSwgMC41LCAtMC41IC8gTWF0aC5QSSwgMC41KSxcclxuXHJcblx0cHJvamVjdDogZnVuY3Rpb24gKGxhdGxuZykgeyAvLyAoTGF0TG5nKSAtPiBQb2ludFxyXG5cdFx0dmFyIHByb2plY3RlZFBvaW50ID0gdGhpcy5wcm9qZWN0aW9uLnByb2plY3QobGF0bG5nKSxcclxuXHRcdCAgICBlYXJ0aFJhZGl1cyA9IDYzNzgxMzc7XHJcblx0XHRyZXR1cm4gcHJvamVjdGVkUG9pbnQubXVsdGlwbHlCeShlYXJ0aFJhZGl1cyk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuQ1JTLkVQU0c5MDA5MTMgPSBMLmV4dGVuZCh7fSwgTC5DUlMuRVBTRzM4NTcsIHtcclxuXHRjb2RlOiAnRVBTRzo5MDA5MTMnXHJcbn0pO1xyXG5cblxuLypcclxuICogTC5DUlMuRVBTRzQzMjYgaXMgYSBDUlMgcG9wdWxhciBhbW9uZyBhZHZhbmNlZCBHSVMgc3BlY2lhbGlzdHMuXHJcbiAqL1xyXG5cclxuTC5DUlMuRVBTRzQzMjYgPSBMLmV4dGVuZCh7fSwgTC5DUlMsIHtcclxuXHRjb2RlOiAnRVBTRzo0MzI2JyxcclxuXHJcblx0cHJvamVjdGlvbjogTC5Qcm9qZWN0aW9uLkxvbkxhdCxcclxuXHR0cmFuc2Zvcm1hdGlvbjogbmV3IEwuVHJhbnNmb3JtYXRpb24oMSAvIDM2MCwgMC41LCAtMSAvIDM2MCwgMC41KVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIEwuTWFwIGlzIHRoZSBjZW50cmFsIGNsYXNzIG9mIHRoZSBBUEkgLSBpdCBpcyB1c2VkIHRvIGNyZWF0ZSBhIG1hcC5cclxuICovXHJcblxyXG5MLk1hcCA9IEwuQ2xhc3MuZXh0ZW5kKHtcclxuXHJcblx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxyXG5cclxuXHRvcHRpb25zOiB7XHJcblx0XHRjcnM6IEwuQ1JTLkVQU0czODU3LFxyXG5cclxuXHRcdC8qXHJcblx0XHRjZW50ZXI6IExhdExuZyxcclxuXHRcdHpvb206IE51bWJlcixcclxuXHRcdGxheWVyczogQXJyYXksXHJcblx0XHQqL1xyXG5cclxuXHRcdGZhZGVBbmltYXRpb246IEwuRG9tVXRpbC5UUkFOU0lUSU9OICYmICFMLkJyb3dzZXIuYW5kcm9pZDIzLFxyXG5cdFx0dHJhY2tSZXNpemU6IHRydWUsXHJcblx0XHRtYXJrZXJab29tQW5pbWF0aW9uOiBMLkRvbVV0aWwuVFJBTlNJVElPTiAmJiBMLkJyb3dzZXIuYW55M2RcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAoaWQsIG9wdGlvbnMpIHsgLy8gKEhUTUxFbGVtZW50IG9yIFN0cmluZywgT2JqZWN0KVxyXG5cdFx0b3B0aW9ucyA9IEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHJcblxyXG5cdFx0dGhpcy5faW5pdENvbnRhaW5lcihpZCk7XHJcblx0XHR0aGlzLl9pbml0TGF5b3V0KCk7XHJcblxyXG5cdFx0Ly8gaGFjayBmb3IgaHR0cHM6Ly9naXRodWIuY29tL0xlYWZsZXQvTGVhZmxldC9pc3N1ZXMvMTk4MFxyXG5cdFx0dGhpcy5fb25SZXNpemUgPSBMLmJpbmQodGhpcy5fb25SZXNpemUsIHRoaXMpO1xyXG5cclxuXHRcdHRoaXMuX2luaXRFdmVudHMoKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5tYXhCb3VuZHMpIHtcclxuXHRcdFx0dGhpcy5zZXRNYXhCb3VuZHMob3B0aW9ucy5tYXhCb3VuZHMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChvcHRpb25zLmNlbnRlciAmJiBvcHRpb25zLnpvb20gIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR0aGlzLnNldFZpZXcoTC5sYXRMbmcob3B0aW9ucy5jZW50ZXIpLCBvcHRpb25zLnpvb20sIHtyZXNldDogdHJ1ZX0pO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2hhbmRsZXJzID0gW107XHJcblxyXG5cdFx0dGhpcy5fbGF5ZXJzID0ge307XHJcblx0XHR0aGlzLl96b29tQm91bmRMYXllcnMgPSB7fTtcclxuXHRcdHRoaXMuX3RpbGVMYXllcnNOdW0gPSAwO1xyXG5cclxuXHRcdHRoaXMuY2FsbEluaXRIb29rcygpO1xyXG5cclxuXHRcdHRoaXMuX2FkZExheWVycyhvcHRpb25zLmxheWVycyk7XHJcblx0fSxcclxuXHJcblxyXG5cdC8vIHB1YmxpYyBtZXRob2RzIHRoYXQgbW9kaWZ5IG1hcCBzdGF0ZVxyXG5cclxuXHQvLyByZXBsYWNlZCBieSBhbmltYXRpb24tcG93ZXJlZCBpbXBsZW1lbnRhdGlvbiBpbiBNYXAuUGFuQW5pbWF0aW9uLmpzXHJcblx0c2V0VmlldzogZnVuY3Rpb24gKGNlbnRlciwgem9vbSkge1xyXG5cdFx0em9vbSA9IHpvb20gPT09IHVuZGVmaW5lZCA/IHRoaXMuZ2V0Wm9vbSgpIDogem9vbTtcclxuXHRcdHRoaXMuX3Jlc2V0VmlldyhMLmxhdExuZyhjZW50ZXIpLCB0aGlzLl9saW1pdFpvb20oem9vbSkpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0c2V0Wm9vbTogZnVuY3Rpb24gKHpvb20sIG9wdGlvbnMpIHtcclxuXHRcdGlmICghdGhpcy5fbG9hZGVkKSB7XHJcblx0XHRcdHRoaXMuX3pvb20gPSB0aGlzLl9saW1pdFpvb20oem9vbSk7XHJcblx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXMuc2V0Vmlldyh0aGlzLmdldENlbnRlcigpLCB6b29tLCB7em9vbTogb3B0aW9uc30pO1xyXG5cdH0sXHJcblxyXG5cdHpvb21JbjogZnVuY3Rpb24gKGRlbHRhLCBvcHRpb25zKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5zZXRab29tKHRoaXMuX3pvb20gKyAoZGVsdGEgfHwgMSksIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdHpvb21PdXQ6IGZ1bmN0aW9uIChkZWx0YSwgb3B0aW9ucykge1xyXG5cdFx0cmV0dXJuIHRoaXMuc2V0Wm9vbSh0aGlzLl96b29tIC0gKGRlbHRhIHx8IDEpLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRzZXRab29tQXJvdW5kOiBmdW5jdGlvbiAobGF0bG5nLCB6b29tLCBvcHRpb25zKSB7XHJcblx0XHR2YXIgc2NhbGUgPSB0aGlzLmdldFpvb21TY2FsZSh6b29tKSxcclxuXHRcdCAgICB2aWV3SGFsZiA9IHRoaXMuZ2V0U2l6ZSgpLmRpdmlkZUJ5KDIpLFxyXG5cdFx0ICAgIGNvbnRhaW5lclBvaW50ID0gbGF0bG5nIGluc3RhbmNlb2YgTC5Qb2ludCA/IGxhdGxuZyA6IHRoaXMubGF0TG5nVG9Db250YWluZXJQb2ludChsYXRsbmcpLFxyXG5cclxuXHRcdCAgICBjZW50ZXJPZmZzZXQgPSBjb250YWluZXJQb2ludC5zdWJ0cmFjdCh2aWV3SGFsZikubXVsdGlwbHlCeSgxIC0gMSAvIHNjYWxlKSxcclxuXHRcdCAgICBuZXdDZW50ZXIgPSB0aGlzLmNvbnRhaW5lclBvaW50VG9MYXRMbmcodmlld0hhbGYuYWRkKGNlbnRlck9mZnNldCkpO1xyXG5cclxuXHRcdHJldHVybiB0aGlzLnNldFZpZXcobmV3Q2VudGVyLCB6b29tLCB7em9vbTogb3B0aW9uc30pO1xyXG5cdH0sXHJcblxyXG5cdGZpdEJvdW5kczogZnVuY3Rpb24gKGJvdW5kcywgb3B0aW9ucykge1xyXG5cclxuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG5cdFx0Ym91bmRzID0gYm91bmRzLmdldEJvdW5kcyA/IGJvdW5kcy5nZXRCb3VuZHMoKSA6IEwubGF0TG5nQm91bmRzKGJvdW5kcyk7XHJcblxyXG5cdFx0dmFyIHBhZGRpbmdUTCA9IEwucG9pbnQob3B0aW9ucy5wYWRkaW5nVG9wTGVmdCB8fCBvcHRpb25zLnBhZGRpbmcgfHwgWzAsIDBdKSxcclxuXHRcdCAgICBwYWRkaW5nQlIgPSBMLnBvaW50KG9wdGlvbnMucGFkZGluZ0JvdHRvbVJpZ2h0IHx8IG9wdGlvbnMucGFkZGluZyB8fCBbMCwgMF0pLFxyXG5cclxuXHRcdCAgICB6b29tID0gdGhpcy5nZXRCb3VuZHNab29tKGJvdW5kcywgZmFsc2UsIHBhZGRpbmdUTC5hZGQocGFkZGluZ0JSKSk7XHJcblxyXG5cdFx0em9vbSA9IChvcHRpb25zLm1heFpvb20pID8gTWF0aC5taW4ob3B0aW9ucy5tYXhab29tLCB6b29tKSA6IHpvb207XHJcblxyXG5cdFx0dmFyIHBhZGRpbmdPZmZzZXQgPSBwYWRkaW5nQlIuc3VidHJhY3QocGFkZGluZ1RMKS5kaXZpZGVCeSgyKSxcclxuXHJcblx0XHQgICAgc3dQb2ludCA9IHRoaXMucHJvamVjdChib3VuZHMuZ2V0U291dGhXZXN0KCksIHpvb20pLFxyXG5cdFx0ICAgIG5lUG9pbnQgPSB0aGlzLnByb2plY3QoYm91bmRzLmdldE5vcnRoRWFzdCgpLCB6b29tKSxcclxuXHRcdCAgICBjZW50ZXIgPSB0aGlzLnVucHJvamVjdChzd1BvaW50LmFkZChuZVBvaW50KS5kaXZpZGVCeSgyKS5hZGQocGFkZGluZ09mZnNldCksIHpvb20pO1xyXG5cclxuXHRcdHJldHVybiB0aGlzLnNldFZpZXcoY2VudGVyLCB6b29tLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRmaXRXb3JsZDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRcdHJldHVybiB0aGlzLmZpdEJvdW5kcyhbWy05MCwgLTE4MF0sIFs5MCwgMTgwXV0sIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdHBhblRvOiBmdW5jdGlvbiAoY2VudGVyLCBvcHRpb25zKSB7IC8vIChMYXRMbmcpXHJcblx0XHRyZXR1cm4gdGhpcy5zZXRWaWV3KGNlbnRlciwgdGhpcy5fem9vbSwge3Bhbjogb3B0aW9uc30pO1xyXG5cdH0sXHJcblxyXG5cdHBhbkJ5OiBmdW5jdGlvbiAob2Zmc2V0KSB7IC8vIChQb2ludClcclxuXHRcdC8vIHJlcGxhY2VkIHdpdGggYW5pbWF0ZWQgcGFuQnkgaW4gTWFwLlBhbkFuaW1hdGlvbi5qc1xyXG5cdFx0dGhpcy5maXJlKCdtb3Zlc3RhcnQnKTtcclxuXHJcblx0XHR0aGlzLl9yYXdQYW5CeShMLnBvaW50KG9mZnNldCkpO1xyXG5cclxuXHRcdHRoaXMuZmlyZSgnbW92ZScpO1xyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgnbW92ZWVuZCcpO1xyXG5cdH0sXHJcblxyXG5cdHNldE1heEJvdW5kczogZnVuY3Rpb24gKGJvdW5kcykge1xyXG5cdFx0Ym91bmRzID0gTC5sYXRMbmdCb3VuZHMoYm91bmRzKTtcclxuXHJcblx0XHR0aGlzLm9wdGlvbnMubWF4Qm91bmRzID0gYm91bmRzO1xyXG5cclxuXHRcdGlmICghYm91bmRzKSB7XHJcblx0XHRcdHJldHVybiB0aGlzLm9mZignbW92ZWVuZCcsIHRoaXMuX3Bhbkluc2lkZU1heEJvdW5kcywgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aGlzLl9wYW5JbnNpZGVNYXhCb3VuZHMoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcy5vbignbW92ZWVuZCcsIHRoaXMuX3Bhbkluc2lkZU1heEJvdW5kcywgdGhpcyk7XHJcblx0fSxcclxuXHJcblx0cGFuSW5zaWRlQm91bmRzOiBmdW5jdGlvbiAoYm91bmRzLCBvcHRpb25zKSB7XHJcblx0XHR2YXIgY2VudGVyID0gdGhpcy5nZXRDZW50ZXIoKSxcclxuXHRcdFx0bmV3Q2VudGVyID0gdGhpcy5fbGltaXRDZW50ZXIoY2VudGVyLCB0aGlzLl96b29tLCBib3VuZHMpO1xyXG5cclxuXHRcdGlmIChjZW50ZXIuZXF1YWxzKG5ld0NlbnRlcikpIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcy5wYW5UbyhuZXdDZW50ZXIsIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdGFkZExheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdC8vIFRPRE8gbWV0aG9kIGlzIHRvbyBiaWcsIHJlZmFjdG9yXHJcblxyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xheWVyc1tpZF0pIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHR0aGlzLl9sYXllcnNbaWRdID0gbGF5ZXI7XHJcblxyXG5cdFx0Ly8gVE9ETyBnZXRNYXhab29tLCBnZXRNaW5ab29tIGluIElMYXllciAoaW5zdGVhZCBvZiBvcHRpb25zKVxyXG5cdFx0aWYgKGxheWVyLm9wdGlvbnMgJiYgKCFpc05hTihsYXllci5vcHRpb25zLm1heFpvb20pIHx8ICFpc05hTihsYXllci5vcHRpb25zLm1pblpvb20pKSkge1xyXG5cdFx0XHR0aGlzLl96b29tQm91bmRMYXllcnNbaWRdID0gbGF5ZXI7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVpvb21MZXZlbHMoKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBUT0RPIGxvb2tzIHVnbHksIHJlZmFjdG9yISEhXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgTC5UaWxlTGF5ZXIgJiYgKGxheWVyIGluc3RhbmNlb2YgTC5UaWxlTGF5ZXIpKSB7XHJcblx0XHRcdHRoaXMuX3RpbGVMYXllcnNOdW0rKztcclxuXHRcdFx0dGhpcy5fdGlsZUxheWVyc1RvTG9hZCsrO1xyXG5cdFx0XHRsYXllci5vbignbG9hZCcsIHRoaXMuX29uVGlsZUxheWVyTG9hZCwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aGlzLl9sYXllckFkZChsYXllcik7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblxyXG5cdFx0aWYgKCF0aGlzLl9sYXllcnNbaWRdKSB7IHJldHVybiB0aGlzOyB9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHRsYXllci5vblJlbW92ZSh0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHRkZWxldGUgdGhpcy5fbGF5ZXJzW2lkXTtcclxuXHJcblx0XHRpZiAodGhpcy5fbG9hZGVkKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbGF5ZXJyZW1vdmUnLCB7bGF5ZXI6IGxheWVyfSk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX3pvb21Cb3VuZExheWVyc1tpZF0pIHtcclxuXHRcdFx0ZGVsZXRlIHRoaXMuX3pvb21Cb3VuZExheWVyc1tpZF07XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVpvb21MZXZlbHMoKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBUT0RPIGxvb2tzIHVnbHksIHJlZmFjdG9yXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgTC5UaWxlTGF5ZXIgJiYgKGxheWVyIGluc3RhbmNlb2YgTC5UaWxlTGF5ZXIpKSB7XHJcblx0XHRcdHRoaXMuX3RpbGVMYXllcnNOdW0tLTtcclxuXHRcdFx0dGhpcy5fdGlsZUxheWVyc1RvTG9hZC0tO1xyXG5cdFx0XHRsYXllci5vZmYoJ2xvYWQnLCB0aGlzLl9vblRpbGVMYXllckxvYWQsIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGhhc0xheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdGlmICghbGF5ZXIpIHsgcmV0dXJuIGZhbHNlOyB9XHJcblxyXG5cdFx0cmV0dXJuIChMLnN0YW1wKGxheWVyKSBpbiB0aGlzLl9sYXllcnMpO1xyXG5cdH0sXHJcblxyXG5cdGVhY2hMYXllcjogZnVuY3Rpb24gKG1ldGhvZCwgY29udGV4dCkge1xyXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLl9sYXllcnMpIHtcclxuXHRcdFx0bWV0aG9kLmNhbGwoY29udGV4dCwgdGhpcy5fbGF5ZXJzW2ldKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGludmFsaWRhdGVTaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdFx0aWYgKCF0aGlzLl9sb2FkZWQpIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHRvcHRpb25zID0gTC5leHRlbmQoe1xyXG5cdFx0XHRhbmltYXRlOiBmYWxzZSxcclxuXHRcdFx0cGFuOiB0cnVlXHJcblx0XHR9LCBvcHRpb25zID09PSB0cnVlID8ge2FuaW1hdGU6IHRydWV9IDogb3B0aW9ucyk7XHJcblxyXG5cdFx0dmFyIG9sZFNpemUgPSB0aGlzLmdldFNpemUoKTtcclxuXHRcdHRoaXMuX3NpemVDaGFuZ2VkID0gdHJ1ZTtcclxuXHRcdHRoaXMuX2luaXRpYWxDZW50ZXIgPSBudWxsO1xyXG5cclxuXHRcdHZhciBuZXdTaXplID0gdGhpcy5nZXRTaXplKCksXHJcblx0XHQgICAgb2xkQ2VudGVyID0gb2xkU2l6ZS5kaXZpZGVCeSgyKS5yb3VuZCgpLFxyXG5cdFx0ICAgIG5ld0NlbnRlciA9IG5ld1NpemUuZGl2aWRlQnkoMikucm91bmQoKSxcclxuXHRcdCAgICBvZmZzZXQgPSBvbGRDZW50ZXIuc3VidHJhY3QobmV3Q2VudGVyKTtcclxuXHJcblx0XHRpZiAoIW9mZnNldC54ICYmICFvZmZzZXQueSkgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdGlmIChvcHRpb25zLmFuaW1hdGUgJiYgb3B0aW9ucy5wYW4pIHtcclxuXHRcdFx0dGhpcy5wYW5CeShvZmZzZXQpO1xyXG5cclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGlmIChvcHRpb25zLnBhbikge1xyXG5cdFx0XHRcdHRoaXMuX3Jhd1BhbkJ5KG9mZnNldCk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHRoaXMuZmlyZSgnbW92ZScpO1xyXG5cclxuXHRcdFx0aWYgKG9wdGlvbnMuZGVib3VuY2VNb3ZlZW5kKSB7XHJcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3NpemVUaW1lcik7XHJcblx0XHRcdFx0dGhpcy5fc2l6ZVRpbWVyID0gc2V0VGltZW91dChMLmJpbmQodGhpcy5maXJlLCB0aGlzLCAnbW92ZWVuZCcpLCAyMDApO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHRoaXMuZmlyZSgnbW92ZWVuZCcpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgncmVzaXplJywge1xyXG5cdFx0XHRvbGRTaXplOiBvbGRTaXplLFxyXG5cdFx0XHRuZXdTaXplOiBuZXdTaXplXHJcblx0XHR9KTtcclxuXHR9LFxyXG5cclxuXHQvLyBUT0RPIGhhbmRsZXIuYWRkVG9cclxuXHRhZGRIYW5kbGVyOiBmdW5jdGlvbiAobmFtZSwgSGFuZGxlckNsYXNzKSB7XHJcblx0XHRpZiAoIUhhbmRsZXJDbGFzcykgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdHZhciBoYW5kbGVyID0gdGhpc1tuYW1lXSA9IG5ldyBIYW5kbGVyQ2xhc3ModGhpcyk7XHJcblxyXG5cdFx0dGhpcy5faGFuZGxlcnMucHVzaChoYW5kbGVyKTtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zW25hbWVdKSB7XHJcblx0XHRcdGhhbmRsZXIuZW5hYmxlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fbG9hZGVkKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgndW5sb2FkJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5faW5pdEV2ZW50cygnb2ZmJyk7XHJcblxyXG5cdFx0dHJ5IHtcclxuXHRcdFx0Ly8gdGhyb3dzIGVycm9yIGluIElFNi04XHJcblx0XHRcdGRlbGV0ZSB0aGlzLl9jb250YWluZXIuX2xlYWZsZXQ7XHJcblx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5fbGVhZmxldCA9IHVuZGVmaW5lZDtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9jbGVhclBhbmVzKCk7XHJcblx0XHRpZiAodGhpcy5fY2xlYXJDb250cm9sUG9zKSB7XHJcblx0XHRcdHRoaXMuX2NsZWFyQ29udHJvbFBvcygpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NsZWFySGFuZGxlcnMoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHJcblx0Ly8gcHVibGljIG1ldGhvZHMgZm9yIGdldHRpbmcgbWFwIHN0YXRlXHJcblxyXG5cdGdldENlbnRlcjogZnVuY3Rpb24gKCkgeyAvLyAoQm9vbGVhbikgLT4gTGF0TG5nXHJcblx0XHR0aGlzLl9jaGVja0lmTG9hZGVkKCk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX2luaXRpYWxDZW50ZXIgJiYgIXRoaXMuX21vdmVkKCkpIHtcclxuXHRcdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxDZW50ZXI7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcy5sYXllclBvaW50VG9MYXRMbmcodGhpcy5fZ2V0Q2VudGVyTGF5ZXJQb2ludCgpKTtcclxuXHR9LFxyXG5cclxuXHRnZXRab29tOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fem9vbTtcclxuXHR9LFxyXG5cclxuXHRnZXRCb3VuZHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBib3VuZHMgPSB0aGlzLmdldFBpeGVsQm91bmRzKCksXHJcblx0XHQgICAgc3cgPSB0aGlzLnVucHJvamVjdChib3VuZHMuZ2V0Qm90dG9tTGVmdCgpKSxcclxuXHRcdCAgICBuZSA9IHRoaXMudW5wcm9qZWN0KGJvdW5kcy5nZXRUb3BSaWdodCgpKTtcclxuXHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nQm91bmRzKHN3LCBuZSk7XHJcblx0fSxcclxuXHJcblx0Z2V0TWluWm9vbTogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5taW5ab29tID09PSB1bmRlZmluZWQgP1xyXG5cdFx0XHQodGhpcy5fbGF5ZXJzTWluWm9vbSA9PT0gdW5kZWZpbmVkID8gMCA6IHRoaXMuX2xheWVyc01pblpvb20pIDpcclxuXHRcdFx0dGhpcy5vcHRpb25zLm1pblpvb207XHJcblx0fSxcclxuXHJcblx0Z2V0TWF4Wm9vbTogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5tYXhab29tID09PSB1bmRlZmluZWQgP1xyXG5cdFx0XHQodGhpcy5fbGF5ZXJzTWF4Wm9vbSA9PT0gdW5kZWZpbmVkID8gSW5maW5pdHkgOiB0aGlzLl9sYXllcnNNYXhab29tKSA6XHJcblx0XHRcdHRoaXMub3B0aW9ucy5tYXhab29tO1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdW5kc1pvb206IGZ1bmN0aW9uIChib3VuZHMsIGluc2lkZSwgcGFkZGluZykgeyAvLyAoTGF0TG5nQm91bmRzWywgQm9vbGVhbiwgUG9pbnRdKSAtPiBOdW1iZXJcclxuXHRcdGJvdW5kcyA9IEwubGF0TG5nQm91bmRzKGJvdW5kcyk7XHJcblxyXG5cdFx0dmFyIHpvb20gPSB0aGlzLmdldE1pblpvb20oKSAtIChpbnNpZGUgPyAxIDogMCksXHJcblx0XHQgICAgbWF4Wm9vbSA9IHRoaXMuZ2V0TWF4Wm9vbSgpLFxyXG5cdFx0ICAgIHNpemUgPSB0aGlzLmdldFNpemUoKSxcclxuXHJcblx0XHQgICAgbncgPSBib3VuZHMuZ2V0Tm9ydGhXZXN0KCksXHJcblx0XHQgICAgc2UgPSBib3VuZHMuZ2V0U291dGhFYXN0KCksXHJcblxyXG5cdFx0ICAgIHpvb21Ob3RGb3VuZCA9IHRydWUsXHJcblx0XHQgICAgYm91bmRzU2l6ZTtcclxuXHJcblx0XHRwYWRkaW5nID0gTC5wb2ludChwYWRkaW5nIHx8IFswLCAwXSk7XHJcblxyXG5cdFx0ZG8ge1xyXG5cdFx0XHR6b29tKys7XHJcblx0XHRcdGJvdW5kc1NpemUgPSB0aGlzLnByb2plY3Qoc2UsIHpvb20pLnN1YnRyYWN0KHRoaXMucHJvamVjdChudywgem9vbSkpLmFkZChwYWRkaW5nKTtcclxuXHRcdFx0em9vbU5vdEZvdW5kID0gIWluc2lkZSA/IHNpemUuY29udGFpbnMoYm91bmRzU2l6ZSkgOiBib3VuZHNTaXplLnggPCBzaXplLnggfHwgYm91bmRzU2l6ZS55IDwgc2l6ZS55O1xyXG5cclxuXHRcdH0gd2hpbGUgKHpvb21Ob3RGb3VuZCAmJiB6b29tIDw9IG1heFpvb20pO1xyXG5cclxuXHRcdGlmICh6b29tTm90Rm91bmQgJiYgaW5zaWRlKSB7XHJcblx0XHRcdHJldHVybiBudWxsO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBpbnNpZGUgPyB6b29tIDogem9vbSAtIDE7XHJcblx0fSxcclxuXHJcblx0Z2V0U2l6ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9zaXplIHx8IHRoaXMuX3NpemVDaGFuZ2VkKSB7XHJcblx0XHRcdHRoaXMuX3NpemUgPSBuZXcgTC5Qb2ludChcclxuXHRcdFx0XHR0aGlzLl9jb250YWluZXIuY2xpZW50V2lkdGgsXHJcblx0XHRcdFx0dGhpcy5fY29udGFpbmVyLmNsaWVudEhlaWdodCk7XHJcblxyXG5cdFx0XHR0aGlzLl9zaXplQ2hhbmdlZCA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXMuX3NpemUuY2xvbmUoKTtcclxuXHR9LFxyXG5cclxuXHRnZXRQaXhlbEJvdW5kczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHRvcExlZnRQb2ludCA9IHRoaXMuX2dldFRvcExlZnRQb2ludCgpO1xyXG5cdFx0cmV0dXJuIG5ldyBMLkJvdW5kcyh0b3BMZWZ0UG9pbnQsIHRvcExlZnRQb2ludC5hZGQodGhpcy5nZXRTaXplKCkpKTtcclxuXHR9LFxyXG5cclxuXHRnZXRQaXhlbE9yaWdpbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fY2hlY2tJZkxvYWRlZCgpO1xyXG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxUb3BMZWZ0UG9pbnQ7XHJcblx0fSxcclxuXHJcblx0Z2V0UGFuZXM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9wYW5lcztcclxuXHR9LFxyXG5cclxuXHRnZXRDb250YWluZXI6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XHJcblx0fSxcclxuXHJcblxyXG5cdC8vIFRPRE8gcmVwbGFjZSB3aXRoIHVuaXZlcnNhbCBpbXBsZW1lbnRhdGlvbiBhZnRlciByZWZhY3RvcmluZyBwcm9qZWN0aW9uc1xyXG5cclxuXHRnZXRab29tU2NhbGU6IGZ1bmN0aW9uICh0b1pvb20pIHtcclxuXHRcdHZhciBjcnMgPSB0aGlzLm9wdGlvbnMuY3JzO1xyXG5cdFx0cmV0dXJuIGNycy5zY2FsZSh0b1pvb20pIC8gY3JzLnNjYWxlKHRoaXMuX3pvb20pO1xyXG5cdH0sXHJcblxyXG5cdGdldFNjYWxlWm9vbTogZnVuY3Rpb24gKHNjYWxlKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fem9vbSArIChNYXRoLmxvZyhzY2FsZSkgLyBNYXRoLkxOMik7XHJcblx0fSxcclxuXHJcblxyXG5cdC8vIGNvbnZlcnNpb24gbWV0aG9kc1xyXG5cclxuXHRwcm9qZWN0OiBmdW5jdGlvbiAobGF0bG5nLCB6b29tKSB7IC8vIChMYXRMbmdbLCBOdW1iZXJdKSAtPiBQb2ludFxyXG5cdFx0em9vbSA9IHpvb20gPT09IHVuZGVmaW5lZCA/IHRoaXMuX3pvb20gOiB6b29tO1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5jcnMubGF0TG5nVG9Qb2ludChMLmxhdExuZyhsYXRsbmcpLCB6b29tKTtcclxuXHR9LFxyXG5cclxuXHR1bnByb2plY3Q6IGZ1bmN0aW9uIChwb2ludCwgem9vbSkgeyAvLyAoUG9pbnRbLCBOdW1iZXJdKSAtPiBMYXRMbmdcclxuXHRcdHpvb20gPSB6b29tID09PSB1bmRlZmluZWQgPyB0aGlzLl96b29tIDogem9vbTtcclxuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuY3JzLnBvaW50VG9MYXRMbmcoTC5wb2ludChwb2ludCksIHpvb20pO1xyXG5cdH0sXHJcblxyXG5cdGxheWVyUG9pbnRUb0xhdExuZzogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludClcclxuXHRcdHZhciBwcm9qZWN0ZWRQb2ludCA9IEwucG9pbnQocG9pbnQpLmFkZCh0aGlzLmdldFBpeGVsT3JpZ2luKCkpO1xyXG5cdFx0cmV0dXJuIHRoaXMudW5wcm9qZWN0KHByb2plY3RlZFBvaW50KTtcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdUb0xheWVyUG9pbnQ6IGZ1bmN0aW9uIChsYXRsbmcpIHsgLy8gKExhdExuZylcclxuXHRcdHZhciBwcm9qZWN0ZWRQb2ludCA9IHRoaXMucHJvamVjdChMLmxhdExuZyhsYXRsbmcpKS5fcm91bmQoKTtcclxuXHRcdHJldHVybiBwcm9qZWN0ZWRQb2ludC5fc3VidHJhY3QodGhpcy5nZXRQaXhlbE9yaWdpbigpKTtcclxuXHR9LFxyXG5cclxuXHRjb250YWluZXJQb2ludFRvTGF5ZXJQb2ludDogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludClcclxuXHRcdHJldHVybiBMLnBvaW50KHBvaW50KS5zdWJ0cmFjdCh0aGlzLl9nZXRNYXBQYW5lUG9zKCkpO1xyXG5cdH0sXHJcblxyXG5cdGxheWVyUG9pbnRUb0NvbnRhaW5lclBvaW50OiBmdW5jdGlvbiAocG9pbnQpIHsgLy8gKFBvaW50KVxyXG5cdFx0cmV0dXJuIEwucG9pbnQocG9pbnQpLmFkZCh0aGlzLl9nZXRNYXBQYW5lUG9zKCkpO1xyXG5cdH0sXHJcblxyXG5cdGNvbnRhaW5lclBvaW50VG9MYXRMbmc6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0dmFyIGxheWVyUG9pbnQgPSB0aGlzLmNvbnRhaW5lclBvaW50VG9MYXllclBvaW50KEwucG9pbnQocG9pbnQpKTtcclxuXHRcdHJldHVybiB0aGlzLmxheWVyUG9pbnRUb0xhdExuZyhsYXllclBvaW50KTtcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdUb0NvbnRhaW5lclBvaW50OiBmdW5jdGlvbiAobGF0bG5nKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5sYXllclBvaW50VG9Db250YWluZXJQb2ludCh0aGlzLmxhdExuZ1RvTGF5ZXJQb2ludChMLmxhdExuZyhsYXRsbmcpKSk7XHJcblx0fSxcclxuXHJcblx0bW91c2VFdmVudFRvQ29udGFpbmVyUG9pbnQ6IGZ1bmN0aW9uIChlKSB7IC8vIChNb3VzZUV2ZW50KVxyXG5cdFx0cmV0dXJuIEwuRG9tRXZlbnQuZ2V0TW91c2VQb3NpdGlvbihlLCB0aGlzLl9jb250YWluZXIpO1xyXG5cdH0sXHJcblxyXG5cdG1vdXNlRXZlbnRUb0xheWVyUG9pbnQ6IGZ1bmN0aW9uIChlKSB7IC8vIChNb3VzZUV2ZW50KVxyXG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbmVyUG9pbnRUb0xheWVyUG9pbnQodGhpcy5tb3VzZUV2ZW50VG9Db250YWluZXJQb2ludChlKSk7XHJcblx0fSxcclxuXHJcblx0bW91c2VFdmVudFRvTGF0TG5nOiBmdW5jdGlvbiAoZSkgeyAvLyAoTW91c2VFdmVudClcclxuXHRcdHJldHVybiB0aGlzLmxheWVyUG9pbnRUb0xhdExuZyh0aGlzLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZSkpO1xyXG5cdH0sXHJcblxyXG5cclxuXHQvLyBtYXAgaW5pdGlhbGl6YXRpb24gbWV0aG9kc1xyXG5cclxuXHRfaW5pdENvbnRhaW5lcjogZnVuY3Rpb24gKGlkKSB7XHJcblx0XHR2YXIgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyID0gTC5Eb21VdGlsLmdldChpZCk7XHJcblxyXG5cdFx0aWYgKCFjb250YWluZXIpIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNYXAgY29udGFpbmVyIG5vdCBmb3VuZC4nKTtcclxuXHRcdH0gZWxzZSBpZiAoY29udGFpbmVyLl9sZWFmbGV0KSB7XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWFwIGNvbnRhaW5lciBpcyBhbHJlYWR5IGluaXRpYWxpemVkLicpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGNvbnRhaW5lci5fbGVhZmxldCA9IHRydWU7XHJcblx0fSxcclxuXHJcblx0X2luaXRMYXlvdXQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjb250YWluZXIgPSB0aGlzLl9jb250YWluZXI7XHJcblxyXG5cdFx0TC5Eb21VdGlsLmFkZENsYXNzKGNvbnRhaW5lciwgJ2xlYWZsZXQtY29udGFpbmVyJyArXHJcblx0XHRcdChMLkJyb3dzZXIudG91Y2ggPyAnIGxlYWZsZXQtdG91Y2gnIDogJycpICtcclxuXHRcdFx0KEwuQnJvd3Nlci5yZXRpbmEgPyAnIGxlYWZsZXQtcmV0aW5hJyA6ICcnKSArXHJcblx0XHRcdChMLkJyb3dzZXIuaWVsdDkgPyAnIGxlYWZsZXQtb2xkaWUnIDogJycpICtcclxuXHRcdFx0KHRoaXMub3B0aW9ucy5mYWRlQW5pbWF0aW9uID8gJyBsZWFmbGV0LWZhZGUtYW5pbScgOiAnJykpO1xyXG5cclxuXHRcdHZhciBwb3NpdGlvbiA9IEwuRG9tVXRpbC5nZXRTdHlsZShjb250YWluZXIsICdwb3NpdGlvbicpO1xyXG5cclxuXHRcdGlmIChwb3NpdGlvbiAhPT0gJ2Fic29sdXRlJyAmJiBwb3NpdGlvbiAhPT0gJ3JlbGF0aXZlJyAmJiBwb3NpdGlvbiAhPT0gJ2ZpeGVkJykge1xyXG5cdFx0XHRjb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2luaXRQYW5lcygpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9pbml0Q29udHJvbFBvcykge1xyXG5cdFx0XHR0aGlzLl9pbml0Q29udHJvbFBvcygpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9pbml0UGFuZXM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwYW5lcyA9IHRoaXMuX3BhbmVzID0ge307XHJcblxyXG5cdFx0dGhpcy5fbWFwUGFuZSA9IHBhbmVzLm1hcFBhbmUgPSB0aGlzLl9jcmVhdGVQYW5lKCdsZWFmbGV0LW1hcC1wYW5lJywgdGhpcy5fY29udGFpbmVyKTtcclxuXHJcblx0XHR0aGlzLl90aWxlUGFuZSA9IHBhbmVzLnRpbGVQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC10aWxlLXBhbmUnLCB0aGlzLl9tYXBQYW5lKTtcclxuXHRcdHBhbmVzLm9iamVjdHNQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC1vYmplY3RzLXBhbmUnLCB0aGlzLl9tYXBQYW5lKTtcclxuXHRcdHBhbmVzLnNoYWRvd1BhbmUgPSB0aGlzLl9jcmVhdGVQYW5lKCdsZWFmbGV0LXNoYWRvdy1wYW5lJyk7XHJcblx0XHRwYW5lcy5vdmVybGF5UGFuZSA9IHRoaXMuX2NyZWF0ZVBhbmUoJ2xlYWZsZXQtb3ZlcmxheS1wYW5lJyk7XHJcblx0XHRwYW5lcy5tYXJrZXJQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC1tYXJrZXItcGFuZScpO1xyXG5cdFx0cGFuZXMucG9wdXBQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC1wb3B1cC1wYW5lJyk7XHJcblxyXG5cdFx0dmFyIHpvb21IaWRlID0gJyBsZWFmbGV0LXpvb20taGlkZSc7XHJcblxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMubWFya2VyWm9vbUFuaW1hdGlvbikge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MocGFuZXMubWFya2VyUGFuZSwgem9vbUhpZGUpO1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MocGFuZXMuc2hhZG93UGFuZSwgem9vbUhpZGUpO1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MocGFuZXMucG9wdXBQYW5lLCB6b29tSGlkZSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZVBhbmU6IGZ1bmN0aW9uIChjbGFzc05hbWUsIGNvbnRhaW5lcikge1xyXG5cdFx0cmV0dXJuIEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIGNsYXNzTmFtZSwgY29udGFpbmVyIHx8IHRoaXMuX3BhbmVzLm9iamVjdHNQYW5lKTtcclxuXHR9LFxyXG5cclxuXHRfY2xlYXJQYW5lczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fY29udGFpbmVyLnJlbW92ZUNoaWxkKHRoaXMuX21hcFBhbmUpO1xyXG5cdH0sXHJcblxyXG5cdF9hZGRMYXllcnM6IGZ1bmN0aW9uIChsYXllcnMpIHtcclxuXHRcdGxheWVycyA9IGxheWVycyA/IChMLlV0aWwuaXNBcnJheShsYXllcnMpID8gbGF5ZXJzIDogW2xheWVyc10pIDogW107XHJcblxyXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbiA9IGxheWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHR0aGlzLmFkZExheWVyKGxheWVyc1tpXSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblxyXG5cdC8vIHByaXZhdGUgbWV0aG9kcyB0aGF0IG1vZGlmeSBtYXAgc3RhdGVcclxuXHJcblx0X3Jlc2V0VmlldzogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgcHJlc2VydmVNYXBPZmZzZXQsIGFmdGVyWm9vbUFuaW0pIHtcclxuXHJcblx0XHR2YXIgem9vbUNoYW5nZWQgPSAodGhpcy5fem9vbSAhPT0gem9vbSk7XHJcblxyXG5cdFx0aWYgKCFhZnRlclpvb21BbmltKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbW92ZXN0YXJ0Jyk7XHJcblxyXG5cdFx0XHRpZiAoem9vbUNoYW5nZWQpIHtcclxuXHRcdFx0XHR0aGlzLmZpcmUoJ3pvb21zdGFydCcpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fem9vbSA9IHpvb207XHJcblx0XHR0aGlzLl9pbml0aWFsQ2VudGVyID0gY2VudGVyO1xyXG5cclxuXHRcdHRoaXMuX2luaXRpYWxUb3BMZWZ0UG9pbnQgPSB0aGlzLl9nZXROZXdUb3BMZWZ0UG9pbnQoY2VudGVyKTtcclxuXHJcblx0XHRpZiAoIXByZXNlcnZlTWFwT2Zmc2V0KSB7XHJcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9tYXBQYW5lLCBuZXcgTC5Qb2ludCgwLCAwKSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLl9pbml0aWFsVG9wTGVmdFBvaW50Ll9hZGQodGhpcy5fZ2V0TWFwUGFuZVBvcygpKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl90aWxlTGF5ZXJzVG9Mb2FkID0gdGhpcy5fdGlsZUxheWVyc051bTtcclxuXHJcblx0XHR2YXIgbG9hZGluZyA9ICF0aGlzLl9sb2FkZWQ7XHJcblx0XHR0aGlzLl9sb2FkZWQgPSB0cnVlO1xyXG5cclxuXHRcdHRoaXMuZmlyZSgndmlld3Jlc2V0Jywge2hhcmQ6ICFwcmVzZXJ2ZU1hcE9mZnNldH0pO1xyXG5cclxuXHRcdGlmIChsb2FkaW5nKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbG9hZCcpO1xyXG5cdFx0XHR0aGlzLmVhY2hMYXllcih0aGlzLl9sYXllckFkZCwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdtb3ZlJyk7XHJcblxyXG5cdFx0aWYgKHpvb21DaGFuZ2VkIHx8IGFmdGVyWm9vbUFuaW0pIHtcclxuXHRcdFx0dGhpcy5maXJlKCd6b29tZW5kJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdtb3ZlZW5kJywge2hhcmQ6ICFwcmVzZXJ2ZU1hcE9mZnNldH0pO1xyXG5cdH0sXHJcblxyXG5cdF9yYXdQYW5CeTogZnVuY3Rpb24gKG9mZnNldCkge1xyXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX21hcFBhbmUsIHRoaXMuX2dldE1hcFBhbmVQb3MoKS5zdWJ0cmFjdChvZmZzZXQpKTtcclxuXHR9LFxyXG5cclxuXHRfZ2V0Wm9vbVNwYW46IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLmdldE1heFpvb20oKSAtIHRoaXMuZ2V0TWluWm9vbSgpO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVab29tTGV2ZWxzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgaSxcclxuXHRcdFx0bWluWm9vbSA9IEluZmluaXR5LFxyXG5cdFx0XHRtYXhab29tID0gLUluZmluaXR5LFxyXG5cdFx0XHRvbGRab29tU3BhbiA9IHRoaXMuX2dldFpvb21TcGFuKCk7XHJcblxyXG5cdFx0Zm9yIChpIGluIHRoaXMuX3pvb21Cb3VuZExheWVycykge1xyXG5cdFx0XHR2YXIgbGF5ZXIgPSB0aGlzLl96b29tQm91bmRMYXllcnNbaV07XHJcblx0XHRcdGlmICghaXNOYU4obGF5ZXIub3B0aW9ucy5taW5ab29tKSkge1xyXG5cdFx0XHRcdG1pblpvb20gPSBNYXRoLm1pbihtaW5ab29tLCBsYXllci5vcHRpb25zLm1pblpvb20pO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmICghaXNOYU4obGF5ZXIub3B0aW9ucy5tYXhab29tKSkge1xyXG5cdFx0XHRcdG1heFpvb20gPSBNYXRoLm1heChtYXhab29tLCBsYXllci5vcHRpb25zLm1heFpvb20pO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKGkgPT09IHVuZGVmaW5lZCkgeyAvLyB3ZSBoYXZlIG5vIHRpbGVsYXllcnNcclxuXHRcdFx0dGhpcy5fbGF5ZXJzTWF4Wm9vbSA9IHRoaXMuX2xheWVyc01pblpvb20gPSB1bmRlZmluZWQ7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLl9sYXllcnNNYXhab29tID0gbWF4Wm9vbTtcclxuXHRcdFx0dGhpcy5fbGF5ZXJzTWluWm9vbSA9IG1pblpvb207XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9sZFpvb21TcGFuICE9PSB0aGlzLl9nZXRab29tU3BhbigpKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnem9vbWxldmVsc2NoYW5nZScpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9wYW5JbnNpZGVNYXhCb3VuZHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMucGFuSW5zaWRlQm91bmRzKHRoaXMub3B0aW9ucy5tYXhCb3VuZHMpO1xyXG5cdH0sXHJcblxyXG5cdF9jaGVja0lmTG9hZGVkOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAoIXRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1NldCBtYXAgY2VudGVyIGFuZCB6b29tIGZpcnN0LicpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIG1hcCBldmVudHNcclxuXHJcblx0X2luaXRFdmVudHM6IGZ1bmN0aW9uIChvbk9mZikge1xyXG5cdFx0aWYgKCFMLkRvbUV2ZW50KSB7IHJldHVybjsgfVxyXG5cclxuXHRcdG9uT2ZmID0gb25PZmYgfHwgJ29uJztcclxuXHJcblx0XHRMLkRvbUV2ZW50W29uT2ZmXSh0aGlzLl9jb250YWluZXIsICdjbGljaycsIHRoaXMuX29uTW91c2VDbGljaywgdGhpcyk7XHJcblxyXG5cdFx0dmFyIGV2ZW50cyA9IFsnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnbW91c2VlbnRlcicsXHJcblx0XHQgICAgICAgICAgICAgICdtb3VzZWxlYXZlJywgJ21vdXNlbW92ZScsICdjb250ZXh0bWVudSddLFxyXG5cdFx0ICAgIGksIGxlbjtcclxuXHJcblx0XHRmb3IgKGkgPSAwLCBsZW4gPSBldmVudHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0TC5Eb21FdmVudFtvbk9mZl0odGhpcy5fY29udGFpbmVyLCBldmVudHNbaV0sIHRoaXMuX2ZpcmVNb3VzZUV2ZW50LCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnRyYWNrUmVzaXplKSB7XHJcblx0XHRcdEwuRG9tRXZlbnRbb25PZmZdKHdpbmRvdywgJ3Jlc2l6ZScsIHRoaXMuX29uUmVzaXplLCB0aGlzKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfb25SZXNpemU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuVXRpbC5jYW5jZWxBbmltRnJhbWUodGhpcy5fcmVzaXplUmVxdWVzdCk7XHJcblx0XHR0aGlzLl9yZXNpemVSZXF1ZXN0ID0gTC5VdGlsLnJlcXVlc3RBbmltRnJhbWUoXHJcblx0XHQgICAgICAgIGZ1bmN0aW9uICgpIHsgdGhpcy5pbnZhbGlkYXRlU2l6ZSh7ZGVib3VuY2VNb3ZlZW5kOiB0cnVlfSk7IH0sIHRoaXMsIGZhbHNlLCB0aGlzLl9jb250YWluZXIpO1xyXG5cdH0sXHJcblxyXG5cdF9vbk1vdXNlQ2xpY2s6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAoIXRoaXMuX2xvYWRlZCB8fCAoIWUuX3NpbXVsYXRlZCAmJlxyXG5cdFx0ICAgICAgICAoKHRoaXMuZHJhZ2dpbmcgJiYgdGhpcy5kcmFnZ2luZy5tb3ZlZCgpKSB8fFxyXG5cdFx0ICAgICAgICAgKHRoaXMuYm94Wm9vbSAgJiYgdGhpcy5ib3hab29tLm1vdmVkKCkpKSkgfHxcclxuXHRcdCAgICAgICAgICAgIEwuRG9tRXZlbnQuX3NraXBwZWQoZSkpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdwcmVjbGljaycpO1xyXG5cdFx0dGhpcy5fZmlyZU1vdXNlRXZlbnQoZSk7XHJcblx0fSxcclxuXHJcblx0X2ZpcmVNb3VzZUV2ZW50OiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0aWYgKCF0aGlzLl9sb2FkZWQgfHwgTC5Eb21FdmVudC5fc2tpcHBlZChlKSkgeyByZXR1cm47IH1cclxuXHJcblx0XHR2YXIgdHlwZSA9IGUudHlwZTtcclxuXHJcblx0XHR0eXBlID0gKHR5cGUgPT09ICdtb3VzZWVudGVyJyA/ICdtb3VzZW92ZXInIDogKHR5cGUgPT09ICdtb3VzZWxlYXZlJyA/ICdtb3VzZW91dCcgOiB0eXBlKSk7XHJcblxyXG5cdFx0aWYgKCF0aGlzLmhhc0V2ZW50TGlzdGVuZXJzKHR5cGUpKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGlmICh0eXBlID09PSAnY29udGV4dG1lbnUnKSB7XHJcblx0XHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGNvbnRhaW5lclBvaW50ID0gdGhpcy5tb3VzZUV2ZW50VG9Db250YWluZXJQb2ludChlKSxcclxuXHRcdCAgICBsYXllclBvaW50ID0gdGhpcy5jb250YWluZXJQb2ludFRvTGF5ZXJQb2ludChjb250YWluZXJQb2ludCksXHJcblx0XHQgICAgbGF0bG5nID0gdGhpcy5sYXllclBvaW50VG9MYXRMbmcobGF5ZXJQb2ludCk7XHJcblxyXG5cdFx0dGhpcy5maXJlKHR5cGUsIHtcclxuXHRcdFx0bGF0bG5nOiBsYXRsbmcsXHJcblx0XHRcdGxheWVyUG9pbnQ6IGxheWVyUG9pbnQsXHJcblx0XHRcdGNvbnRhaW5lclBvaW50OiBjb250YWluZXJQb2ludCxcclxuXHRcdFx0b3JpZ2luYWxFdmVudDogZVxyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0X29uVGlsZUxheWVyTG9hZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fdGlsZUxheWVyc1RvTG9hZC0tO1xyXG5cdFx0aWYgKHRoaXMuX3RpbGVMYXllcnNOdW0gJiYgIXRoaXMuX3RpbGVMYXllcnNUb0xvYWQpIHtcclxuXHRcdFx0dGhpcy5maXJlKCd0aWxlbGF5ZXJzbG9hZCcpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9jbGVhckhhbmRsZXJzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuID0gdGhpcy5faGFuZGxlcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0dGhpcy5faGFuZGxlcnNbaV0uZGlzYWJsZSgpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHdoZW5SZWFkeTogZnVuY3Rpb24gKGNhbGxiYWNrLCBjb250ZXh0KSB7XHJcblx0XHRpZiAodGhpcy5fbG9hZGVkKSB7XHJcblx0XHRcdGNhbGxiYWNrLmNhbGwoY29udGV4dCB8fCB0aGlzLCB0aGlzKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMub24oJ2xvYWQnLCBjYWxsYmFjaywgY29udGV4dCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRfbGF5ZXJBZGQ6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0bGF5ZXIub25BZGQodGhpcyk7XHJcblx0XHR0aGlzLmZpcmUoJ2xheWVyYWRkJywge2xheWVyOiBsYXllcn0pO1xyXG5cdH0sXHJcblxyXG5cclxuXHQvLyBwcml2YXRlIG1ldGhvZHMgZm9yIGdldHRpbmcgbWFwIHN0YXRlXHJcblxyXG5cdF9nZXRNYXBQYW5lUG9zOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gTC5Eb21VdGlsLmdldFBvc2l0aW9uKHRoaXMuX21hcFBhbmUpO1xyXG5cdH0sXHJcblxyXG5cdF9tb3ZlZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBvcyA9IHRoaXMuX2dldE1hcFBhbmVQb3MoKTtcclxuXHRcdHJldHVybiBwb3MgJiYgIXBvcy5lcXVhbHMoWzAsIDBdKTtcclxuXHR9LFxyXG5cclxuXHRfZ2V0VG9wTGVmdFBvaW50OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5nZXRQaXhlbE9yaWdpbigpLnN1YnRyYWN0KHRoaXMuX2dldE1hcFBhbmVQb3MoKSk7XHJcblx0fSxcclxuXHJcblx0X2dldE5ld1RvcExlZnRQb2ludDogZnVuY3Rpb24gKGNlbnRlciwgem9vbSkge1xyXG5cdFx0dmFyIHZpZXdIYWxmID0gdGhpcy5nZXRTaXplKCkuX2RpdmlkZUJ5KDIpO1xyXG5cdFx0Ly8gVE9ETyByb3VuZCBvbiBkaXNwbGF5LCBub3QgY2FsY3VsYXRpb24gdG8gaW5jcmVhc2UgcHJlY2lzaW9uP1xyXG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdChjZW50ZXIsIHpvb20pLl9zdWJ0cmFjdCh2aWV3SGFsZikuX3JvdW5kKCk7XHJcblx0fSxcclxuXHJcblx0X2xhdExuZ1RvTmV3TGF5ZXJQb2ludDogZnVuY3Rpb24gKGxhdGxuZywgbmV3Wm9vbSwgbmV3Q2VudGVyKSB7XHJcblx0XHR2YXIgdG9wTGVmdCA9IHRoaXMuX2dldE5ld1RvcExlZnRQb2ludChuZXdDZW50ZXIsIG5ld1pvb20pLmFkZCh0aGlzLl9nZXRNYXBQYW5lUG9zKCkpO1xyXG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdChsYXRsbmcsIG5ld1pvb20pLl9zdWJ0cmFjdCh0b3BMZWZ0KTtcclxuXHR9LFxyXG5cclxuXHQvLyBsYXllciBwb2ludCBvZiB0aGUgY3VycmVudCBjZW50ZXJcclxuXHRfZ2V0Q2VudGVyTGF5ZXJQb2ludDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbmVyUG9pbnRUb0xheWVyUG9pbnQodGhpcy5nZXRTaXplKCkuX2RpdmlkZUJ5KDIpKTtcclxuXHR9LFxyXG5cclxuXHQvLyBvZmZzZXQgb2YgdGhlIHNwZWNpZmllZCBwbGFjZSB0byB0aGUgY3VycmVudCBjZW50ZXIgaW4gcGl4ZWxzXHJcblx0X2dldENlbnRlck9mZnNldDogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0cmV0dXJuIHRoaXMubGF0TG5nVG9MYXllclBvaW50KGxhdGxuZykuc3VidHJhY3QodGhpcy5fZ2V0Q2VudGVyTGF5ZXJQb2ludCgpKTtcclxuXHR9LFxyXG5cclxuXHQvLyBhZGp1c3QgY2VudGVyIGZvciB2aWV3IHRvIGdldCBpbnNpZGUgYm91bmRzXHJcblx0X2xpbWl0Q2VudGVyOiBmdW5jdGlvbiAoY2VudGVyLCB6b29tLCBib3VuZHMpIHtcclxuXHJcblx0XHRpZiAoIWJvdW5kcykgeyByZXR1cm4gY2VudGVyOyB9XHJcblxyXG5cdFx0dmFyIGNlbnRlclBvaW50ID0gdGhpcy5wcm9qZWN0KGNlbnRlciwgem9vbSksXHJcblx0XHQgICAgdmlld0hhbGYgPSB0aGlzLmdldFNpemUoKS5kaXZpZGVCeSgyKSxcclxuXHRcdCAgICB2aWV3Qm91bmRzID0gbmV3IEwuQm91bmRzKGNlbnRlclBvaW50LnN1YnRyYWN0KHZpZXdIYWxmKSwgY2VudGVyUG9pbnQuYWRkKHZpZXdIYWxmKSksXHJcblx0XHQgICAgb2Zmc2V0ID0gdGhpcy5fZ2V0Qm91bmRzT2Zmc2V0KHZpZXdCb3VuZHMsIGJvdW5kcywgem9vbSk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMudW5wcm9qZWN0KGNlbnRlclBvaW50LmFkZChvZmZzZXQpLCB6b29tKTtcclxuXHR9LFxyXG5cclxuXHQvLyBhZGp1c3Qgb2Zmc2V0IGZvciB2aWV3IHRvIGdldCBpbnNpZGUgYm91bmRzXHJcblx0X2xpbWl0T2Zmc2V0OiBmdW5jdGlvbiAob2Zmc2V0LCBib3VuZHMpIHtcclxuXHRcdGlmICghYm91bmRzKSB7IHJldHVybiBvZmZzZXQ7IH1cclxuXHJcblx0XHR2YXIgdmlld0JvdW5kcyA9IHRoaXMuZ2V0UGl4ZWxCb3VuZHMoKSxcclxuXHRcdCAgICBuZXdCb3VuZHMgPSBuZXcgTC5Cb3VuZHModmlld0JvdW5kcy5taW4uYWRkKG9mZnNldCksIHZpZXdCb3VuZHMubWF4LmFkZChvZmZzZXQpKTtcclxuXHJcblx0XHRyZXR1cm4gb2Zmc2V0LmFkZCh0aGlzLl9nZXRCb3VuZHNPZmZzZXQobmV3Qm91bmRzLCBib3VuZHMpKTtcclxuXHR9LFxyXG5cclxuXHQvLyByZXR1cm5zIG9mZnNldCBuZWVkZWQgZm9yIHB4Qm91bmRzIHRvIGdldCBpbnNpZGUgbWF4Qm91bmRzIGF0IGEgc3BlY2lmaWVkIHpvb21cclxuXHRfZ2V0Qm91bmRzT2Zmc2V0OiBmdW5jdGlvbiAocHhCb3VuZHMsIG1heEJvdW5kcywgem9vbSkge1xyXG5cdFx0dmFyIG53T2Zmc2V0ID0gdGhpcy5wcm9qZWN0KG1heEJvdW5kcy5nZXROb3J0aFdlc3QoKSwgem9vbSkuc3VidHJhY3QocHhCb3VuZHMubWluKSxcclxuXHRcdCAgICBzZU9mZnNldCA9IHRoaXMucHJvamVjdChtYXhCb3VuZHMuZ2V0U291dGhFYXN0KCksIHpvb20pLnN1YnRyYWN0KHB4Qm91bmRzLm1heCksXHJcblxyXG5cdFx0ICAgIGR4ID0gdGhpcy5fcmVib3VuZChud09mZnNldC54LCAtc2VPZmZzZXQueCksXHJcblx0XHQgICAgZHkgPSB0aGlzLl9yZWJvdW5kKG53T2Zmc2V0LnksIC1zZU9mZnNldC55KTtcclxuXHJcblx0XHRyZXR1cm4gbmV3IEwuUG9pbnQoZHgsIGR5KTtcclxuXHR9LFxyXG5cclxuXHRfcmVib3VuZDogZnVuY3Rpb24gKGxlZnQsIHJpZ2h0KSB7XHJcblx0XHRyZXR1cm4gbGVmdCArIHJpZ2h0ID4gMCA/XHJcblx0XHRcdE1hdGgucm91bmQobGVmdCAtIHJpZ2h0KSAvIDIgOlxyXG5cdFx0XHRNYXRoLm1heCgwLCBNYXRoLmNlaWwobGVmdCkpIC0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcihyaWdodCkpO1xyXG5cdH0sXHJcblxyXG5cdF9saW1pdFpvb206IGZ1bmN0aW9uICh6b29tKSB7XHJcblx0XHR2YXIgbWluID0gdGhpcy5nZXRNaW5ab29tKCksXHJcblx0XHQgICAgbWF4ID0gdGhpcy5nZXRNYXhab29tKCk7XHJcblxyXG5cdFx0cmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB6b29tKSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwubWFwID0gZnVuY3Rpb24gKGlkLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLk1hcChpZCwgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBNZXJjYXRvciBwcm9qZWN0aW9uIHRoYXQgdGFrZXMgaW50byBhY2NvdW50IHRoYXQgdGhlIEVhcnRoIGlzIG5vdCBhIHBlcmZlY3Qgc3BoZXJlLlxyXG4gKiBMZXNzIHBvcHVsYXIgdGhhbiBzcGhlcmljYWwgbWVyY2F0b3I7IHVzZWQgYnkgcHJvamVjdGlvbnMgbGlrZSBFUFNHOjMzOTUuXHJcbiAqL1xyXG5cclxuTC5Qcm9qZWN0aW9uLk1lcmNhdG9yID0ge1xyXG5cdE1BWF9MQVRJVFVERTogODUuMDg0MDU5MTU1NixcclxuXHJcblx0Ul9NSU5PUjogNjM1Njc1Mi4zMTQyNDUxNzksXHJcblx0Ul9NQUpPUjogNjM3ODEzNyxcclxuXHJcblx0cHJvamVjdDogZnVuY3Rpb24gKGxhdGxuZykgeyAvLyAoTGF0TG5nKSAtPiBQb2ludFxyXG5cdFx0dmFyIGQgPSBMLkxhdExuZy5ERUdfVE9fUkFELFxyXG5cdFx0ICAgIG1heCA9IHRoaXMuTUFYX0xBVElUVURFLFxyXG5cdFx0ICAgIGxhdCA9IE1hdGgubWF4KE1hdGgubWluKG1heCwgbGF0bG5nLmxhdCksIC1tYXgpLFxyXG5cdFx0ICAgIHIgPSB0aGlzLlJfTUFKT1IsXHJcblx0XHQgICAgcjIgPSB0aGlzLlJfTUlOT1IsXHJcblx0XHQgICAgeCA9IGxhdGxuZy5sbmcgKiBkICogcixcclxuXHRcdCAgICB5ID0gbGF0ICogZCxcclxuXHRcdCAgICB0bXAgPSByMiAvIHIsXHJcblx0XHQgICAgZWNjZW50ID0gTWF0aC5zcXJ0KDEuMCAtIHRtcCAqIHRtcCksXHJcblx0XHQgICAgY29uID0gZWNjZW50ICogTWF0aC5zaW4oeSk7XHJcblxyXG5cdFx0Y29uID0gTWF0aC5wb3coKDEgLSBjb24pIC8gKDEgKyBjb24pLCBlY2NlbnQgKiAwLjUpO1xyXG5cclxuXHRcdHZhciB0cyA9IE1hdGgudGFuKDAuNSAqICgoTWF0aC5QSSAqIDAuNSkgLSB5KSkgLyBjb247XHJcblx0XHR5ID0gLXIgKiBNYXRoLmxvZyh0cyk7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KHgsIHkpO1xyXG5cdH0sXHJcblxyXG5cdHVucHJvamVjdDogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludCwgQm9vbGVhbikgLT4gTGF0TG5nXHJcblx0XHR2YXIgZCA9IEwuTGF0TG5nLlJBRF9UT19ERUcsXHJcblx0XHQgICAgciA9IHRoaXMuUl9NQUpPUixcclxuXHRcdCAgICByMiA9IHRoaXMuUl9NSU5PUixcclxuXHRcdCAgICBsbmcgPSBwb2ludC54ICogZCAvIHIsXHJcblx0XHQgICAgdG1wID0gcjIgLyByLFxyXG5cdFx0ICAgIGVjY2VudCA9IE1hdGguc3FydCgxIC0gKHRtcCAqIHRtcCkpLFxyXG5cdFx0ICAgIHRzID0gTWF0aC5leHAoLSBwb2ludC55IC8gciksXHJcblx0XHQgICAgcGhpID0gKE1hdGguUEkgLyAyKSAtIDIgKiBNYXRoLmF0YW4odHMpLFxyXG5cdFx0ICAgIG51bUl0ZXIgPSAxNSxcclxuXHRcdCAgICB0b2wgPSAxZS03LFxyXG5cdFx0ICAgIGkgPSBudW1JdGVyLFxyXG5cdFx0ICAgIGRwaGkgPSAwLjEsXHJcblx0XHQgICAgY29uO1xyXG5cclxuXHRcdHdoaWxlICgoTWF0aC5hYnMoZHBoaSkgPiB0b2wpICYmICgtLWkgPiAwKSkge1xyXG5cdFx0XHRjb24gPSBlY2NlbnQgKiBNYXRoLnNpbihwaGkpO1xyXG5cdFx0XHRkcGhpID0gKE1hdGguUEkgLyAyKSAtIDIgKiBNYXRoLmF0YW4odHMgKlxyXG5cdFx0XHQgICAgICAgICAgICBNYXRoLnBvdygoMS4wIC0gY29uKSAvICgxLjAgKyBjb24pLCAwLjUgKiBlY2NlbnQpKSAtIHBoaTtcclxuXHRcdFx0cGhpICs9IGRwaGk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZyhwaGkgKiBkLCBsbmcpO1xyXG5cdH1cclxufTtcclxuXG5cblxyXG5MLkNSUy5FUFNHMzM5NSA9IEwuZXh0ZW5kKHt9LCBMLkNSUywge1xyXG5cdGNvZGU6ICdFUFNHOjMzOTUnLFxyXG5cclxuXHRwcm9qZWN0aW9uOiBMLlByb2plY3Rpb24uTWVyY2F0b3IsXHJcblxyXG5cdHRyYW5zZm9ybWF0aW9uOiAoZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIG0gPSBMLlByb2plY3Rpb24uTWVyY2F0b3IsXHJcblx0XHQgICAgciA9IG0uUl9NQUpPUixcclxuXHRcdCAgICBzY2FsZSA9IDAuNSAvIChNYXRoLlBJICogcik7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlRyYW5zZm9ybWF0aW9uKHNjYWxlLCAwLjUsIC1zY2FsZSwgMC41KTtcclxuXHR9KCkpXHJcbn0pO1xyXG5cblxuLypcclxuICogTC5UaWxlTGF5ZXIgaXMgdXNlZCBmb3Igc3RhbmRhcmQgeHl6LW51bWJlcmVkIHRpbGUgbGF5ZXJzLlxyXG4gKi9cclxuXHJcbkwuVGlsZUxheWVyID0gTC5DbGFzcy5leHRlbmQoe1xyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0bWluWm9vbTogMCxcclxuXHRcdG1heFpvb206IDE4LFxyXG5cdFx0dGlsZVNpemU6IDI1NixcclxuXHRcdHN1YmRvbWFpbnM6ICdhYmMnLFxyXG5cdFx0ZXJyb3JUaWxlVXJsOiAnJyxcclxuXHRcdGF0dHJpYnV0aW9uOiAnJyxcclxuXHRcdHpvb21PZmZzZXQ6IDAsXHJcblx0XHRvcGFjaXR5OiAxLFxyXG5cdFx0LypcclxuXHRcdG1heE5hdGl2ZVpvb206IG51bGwsXHJcblx0XHR6SW5kZXg6IG51bGwsXHJcblx0XHR0bXM6IGZhbHNlLFxyXG5cdFx0Y29udGludW91c1dvcmxkOiBmYWxzZSxcclxuXHRcdG5vV3JhcDogZmFsc2UsXHJcblx0XHR6b29tUmV2ZXJzZTogZmFsc2UsXHJcblx0XHRkZXRlY3RSZXRpbmE6IGZhbHNlLFxyXG5cdFx0cmV1c2VUaWxlczogZmFsc2UsXHJcblx0XHRib3VuZHM6IGZhbHNlLFxyXG5cdFx0Ki9cclxuXHRcdHVubG9hZEludmlzaWJsZVRpbGVzOiBMLkJyb3dzZXIubW9iaWxlLFxyXG5cdFx0dXBkYXRlV2hlbklkbGU6IEwuQnJvd3Nlci5tb2JpbGVcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAodXJsLCBvcHRpb25zKSB7XHJcblx0XHRvcHRpb25zID0gTC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdC8vIGRldGVjdGluZyByZXRpbmEgZGlzcGxheXMsIGFkanVzdGluZyB0aWxlU2l6ZSBhbmQgem9vbSBsZXZlbHNcclxuXHRcdGlmIChvcHRpb25zLmRldGVjdFJldGluYSAmJiBMLkJyb3dzZXIucmV0aW5hICYmIG9wdGlvbnMubWF4Wm9vbSA+IDApIHtcclxuXHJcblx0XHRcdG9wdGlvbnMudGlsZVNpemUgPSBNYXRoLmZsb29yKG9wdGlvbnMudGlsZVNpemUgLyAyKTtcclxuXHRcdFx0b3B0aW9ucy56b29tT2Zmc2V0Kys7XHJcblxyXG5cdFx0XHRpZiAob3B0aW9ucy5taW5ab29tID4gMCkge1xyXG5cdFx0XHRcdG9wdGlvbnMubWluWm9vbS0tO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMub3B0aW9ucy5tYXhab29tLS07XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMuYm91bmRzKSB7XHJcblx0XHRcdG9wdGlvbnMuYm91bmRzID0gTC5sYXRMbmdCb3VuZHMob3B0aW9ucy5ib3VuZHMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHJcblx0XHR2YXIgc3ViZG9tYWlucyA9IHRoaXMub3B0aW9ucy5zdWJkb21haW5zO1xyXG5cclxuXHRcdGlmICh0eXBlb2Ygc3ViZG9tYWlucyA9PT0gJ3N0cmluZycpIHtcclxuXHRcdFx0dGhpcy5vcHRpb25zLnN1YmRvbWFpbnMgPSBzdWJkb21haW5zLnNwbGl0KCcnKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRvbkFkZDogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5fbWFwID0gbWFwO1xyXG5cdFx0dGhpcy5fYW5pbWF0ZWQgPSBtYXAuX3pvb21BbmltYXRlZDtcclxuXHJcblx0XHQvLyBjcmVhdGUgYSBjb250YWluZXIgZGl2IGZvciB0aWxlc1xyXG5cdFx0dGhpcy5faW5pdENvbnRhaW5lcigpO1xyXG5cclxuXHRcdC8vIHNldCB1cCBldmVudHNcclxuXHRcdG1hcC5vbih7XHJcblx0XHRcdCd2aWV3cmVzZXQnOiB0aGlzLl9yZXNldCxcclxuXHRcdFx0J21vdmVlbmQnOiB0aGlzLl91cGRhdGVcclxuXHRcdH0sIHRoaXMpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9hbmltYXRlZCkge1xyXG5cdFx0XHRtYXAub24oe1xyXG5cdFx0XHRcdCd6b29tYW5pbSc6IHRoaXMuX2FuaW1hdGVab29tLFxyXG5cdFx0XHRcdCd6b29tZW5kJzogdGhpcy5fZW5kWm9vbUFuaW1cclxuXHRcdFx0fSwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMudXBkYXRlV2hlbklkbGUpIHtcclxuXHRcdFx0dGhpcy5fbGltaXRlZFVwZGF0ZSA9IEwuVXRpbC5saW1pdEV4ZWNCeUludGVydmFsKHRoaXMuX3VwZGF0ZSwgMTUwLCB0aGlzKTtcclxuXHRcdFx0bWFwLm9uKCdtb3ZlJywgdGhpcy5fbGltaXRlZFVwZGF0ZSwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fcmVzZXQoKTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5fY29udGFpbmVyLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcclxuXHJcblx0XHRtYXAub2ZmKHtcclxuXHRcdFx0J3ZpZXdyZXNldCc6IHRoaXMuX3Jlc2V0LFxyXG5cdFx0XHQnbW92ZWVuZCc6IHRoaXMuX3VwZGF0ZVxyXG5cdFx0fSwgdGhpcyk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX2FuaW1hdGVkKSB7XHJcblx0XHRcdG1hcC5vZmYoe1xyXG5cdFx0XHRcdCd6b29tYW5pbSc6IHRoaXMuX2FuaW1hdGVab29tLFxyXG5cdFx0XHRcdCd6b29tZW5kJzogdGhpcy5fZW5kWm9vbUFuaW1cclxuXHRcdFx0fSwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMudXBkYXRlV2hlbklkbGUpIHtcclxuXHRcdFx0bWFwLm9mZignbW92ZScsIHRoaXMuX2xpbWl0ZWRVcGRhdGUsIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IG51bGw7XHJcblx0XHR0aGlzLl9tYXAgPSBudWxsO1xyXG5cdH0sXHJcblxyXG5cdGJyaW5nVG9Gcm9udDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBhbmUgPSB0aGlzLl9tYXAuX3BhbmVzLnRpbGVQYW5lO1xyXG5cclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0cGFuZS5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cdFx0XHR0aGlzLl9zZXRBdXRvWkluZGV4KHBhbmUsIE1hdGgubWF4KTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRicmluZ1RvQmFjazogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBhbmUgPSB0aGlzLl9tYXAuX3BhbmVzLnRpbGVQYW5lO1xyXG5cclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0cGFuZS5pbnNlcnRCZWZvcmUodGhpcy5fY29udGFpbmVyLCBwYW5lLmZpcnN0Q2hpbGQpO1xyXG5cdFx0XHR0aGlzLl9zZXRBdXRvWkluZGV4KHBhbmUsIE1hdGgubWluKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRnZXRBdHRyaWJ1dGlvbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5hdHRyaWJ1dGlvbjtcclxuXHR9LFxyXG5cclxuXHRnZXRDb250YWluZXI6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XHJcblx0fSxcclxuXHJcblx0c2V0T3BhY2l0eTogZnVuY3Rpb24gKG9wYWNpdHkpIHtcclxuXHRcdHRoaXMub3B0aW9ucy5vcGFjaXR5ID0gb3BhY2l0eTtcclxuXHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZU9wYWNpdHkoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRaSW5kZXg6IGZ1bmN0aW9uICh6SW5kZXgpIHtcclxuXHRcdHRoaXMub3B0aW9ucy56SW5kZXggPSB6SW5kZXg7XHJcblx0XHR0aGlzLl91cGRhdGVaSW5kZXgoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRVcmw6IGZ1bmN0aW9uICh1cmwsIG5vUmVkcmF3KSB7XHJcblx0XHR0aGlzLl91cmwgPSB1cmw7XHJcblxyXG5cdFx0aWYgKCFub1JlZHJhdykge1xyXG5cdFx0XHR0aGlzLnJlZHJhdygpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHJlZHJhdzogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMuX21hcCkge1xyXG5cdFx0XHR0aGlzLl9yZXNldCh7aGFyZDogdHJ1ZX0pO1xyXG5cdFx0XHR0aGlzLl91cGRhdGUoKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVaSW5kZXg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIgJiYgdGhpcy5vcHRpb25zLnpJbmRleCAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS56SW5kZXggPSB0aGlzLm9wdGlvbnMuekluZGV4O1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9zZXRBdXRvWkluZGV4OiBmdW5jdGlvbiAocGFuZSwgY29tcGFyZSkge1xyXG5cclxuXHRcdHZhciBsYXllcnMgPSBwYW5lLmNoaWxkcmVuLFxyXG5cdFx0ICAgIGVkZ2VaSW5kZXggPSAtY29tcGFyZShJbmZpbml0eSwgLUluZmluaXR5KSwgLy8gLUluZmluaXR5IGZvciBtYXgsIEluZmluaXR5IGZvciBtaW5cclxuXHRcdCAgICB6SW5kZXgsIGksIGxlbjtcclxuXHJcblx0XHRmb3IgKGkgPSAwLCBsZW4gPSBsYXllcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHJcblx0XHRcdGlmIChsYXllcnNbaV0gIT09IHRoaXMuX2NvbnRhaW5lcikge1xyXG5cdFx0XHRcdHpJbmRleCA9IHBhcnNlSW50KGxheWVyc1tpXS5zdHlsZS56SW5kZXgsIDEwKTtcclxuXHJcblx0XHRcdFx0aWYgKCFpc05hTih6SW5kZXgpKSB7XHJcblx0XHRcdFx0XHRlZGdlWkluZGV4ID0gY29tcGFyZShlZGdlWkluZGV4LCB6SW5kZXgpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMub3B0aW9ucy56SW5kZXggPSB0aGlzLl9jb250YWluZXIuc3R5bGUuekluZGV4ID1cclxuXHRcdCAgICAgICAgKGlzRmluaXRlKGVkZ2VaSW5kZXgpID8gZWRnZVpJbmRleCA6IDApICsgY29tcGFyZSgxLCAtMSk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZU9wYWNpdHk6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBpLFxyXG5cdFx0ICAgIHRpbGVzID0gdGhpcy5fdGlsZXM7XHJcblxyXG5cdFx0aWYgKEwuQnJvd3Nlci5pZWx0OSkge1xyXG5cdFx0XHRmb3IgKGkgaW4gdGlsZXMpIHtcclxuXHRcdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aWxlc1tpXSwgdGhpcy5vcHRpb25zLm9wYWNpdHkpO1xyXG5cdFx0XHR9XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aGlzLl9jb250YWluZXIsIHRoaXMub3B0aW9ucy5vcGFjaXR5KTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfaW5pdENvbnRhaW5lcjogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHRpbGVQYW5lID0gdGhpcy5fbWFwLl9wYW5lcy50aWxlUGFuZTtcclxuXHJcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xyXG5cdFx0XHR0aGlzLl9jb250YWluZXIgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1sYXllcicpO1xyXG5cclxuXHRcdFx0dGhpcy5fdXBkYXRlWkluZGV4KCk7XHJcblxyXG5cdFx0XHRpZiAodGhpcy5fYW5pbWF0ZWQpIHtcclxuXHRcdFx0XHR2YXIgY2xhc3NOYW1lID0gJ2xlYWZsZXQtdGlsZS1jb250YWluZXInO1xyXG5cclxuXHRcdFx0XHR0aGlzLl9iZ0J1ZmZlciA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIGNsYXNzTmFtZSwgdGhpcy5fY29udGFpbmVyKTtcclxuXHRcdFx0XHR0aGlzLl90aWxlQ29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lLCB0aGlzLl9jb250YWluZXIpO1xyXG5cclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLl90aWxlQ29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR0aWxlUGFuZS5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5vcGFjaXR5IDwgMSkge1xyXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZU9wYWNpdHkoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9yZXNldDogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGZvciAodmFyIGtleSBpbiB0aGlzLl90aWxlcykge1xyXG5cdFx0XHR0aGlzLmZpcmUoJ3RpbGV1bmxvYWQnLCB7dGlsZTogdGhpcy5fdGlsZXNba2V5XX0pO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3RpbGVzID0ge307XHJcblx0XHR0aGlzLl90aWxlc1RvTG9hZCA9IDA7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZXVzZVRpbGVzKSB7XHJcblx0XHRcdHRoaXMuX3VudXNlZFRpbGVzID0gW107XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fdGlsZUNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcclxuXHJcblx0XHRpZiAodGhpcy5fYW5pbWF0ZWQgJiYgZSAmJiBlLmhhcmQpIHtcclxuXHRcdFx0dGhpcy5fY2xlYXJCZ0J1ZmZlcigpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2luaXRDb250YWluZXIoKTtcclxuXHR9LFxyXG5cclxuXHRfZ2V0VGlsZVNpemU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHQgICAgem9vbSA9IG1hcC5nZXRab29tKCkgKyB0aGlzLm9wdGlvbnMuem9vbU9mZnNldCxcclxuXHRcdCAgICB6b29tTiA9IHRoaXMub3B0aW9ucy5tYXhOYXRpdmVab29tLFxyXG5cdFx0ICAgIHRpbGVTaXplID0gdGhpcy5vcHRpb25zLnRpbGVTaXplO1xyXG5cclxuXHRcdGlmICh6b29tTiAmJiB6b29tID4gem9vbU4pIHtcclxuXHRcdFx0dGlsZVNpemUgPSBNYXRoLnJvdW5kKG1hcC5nZXRab29tU2NhbGUoem9vbSkgLyBtYXAuZ2V0Wm9vbVNjYWxlKHpvb21OKSAqIHRpbGVTaXplKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGlsZVNpemU7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG5cclxuXHRcdGlmICghdGhpcy5fbWFwKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHQgICAgYm91bmRzID0gbWFwLmdldFBpeGVsQm91bmRzKCksXHJcblx0XHQgICAgem9vbSA9IG1hcC5nZXRab29tKCksXHJcblx0XHQgICAgdGlsZVNpemUgPSB0aGlzLl9nZXRUaWxlU2l6ZSgpO1xyXG5cclxuXHRcdGlmICh6b29tID4gdGhpcy5vcHRpb25zLm1heFpvb20gfHwgem9vbSA8IHRoaXMub3B0aW9ucy5taW5ab29tKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgdGlsZUJvdW5kcyA9IEwuYm91bmRzKFxyXG5cdFx0ICAgICAgICBib3VuZHMubWluLmRpdmlkZUJ5KHRpbGVTaXplKS5fZmxvb3IoKSxcclxuXHRcdCAgICAgICAgYm91bmRzLm1heC5kaXZpZGVCeSh0aWxlU2l6ZSkuX2Zsb29yKCkpO1xyXG5cclxuXHRcdHRoaXMuX2FkZFRpbGVzRnJvbUNlbnRlck91dCh0aWxlQm91bmRzKTtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnVubG9hZEludmlzaWJsZVRpbGVzIHx8IHRoaXMub3B0aW9ucy5yZXVzZVRpbGVzKSB7XHJcblx0XHRcdHRoaXMuX3JlbW92ZU90aGVyVGlsZXModGlsZUJvdW5kcyk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2FkZFRpbGVzRnJvbUNlbnRlck91dDogZnVuY3Rpb24gKGJvdW5kcykge1xyXG5cdFx0dmFyIHF1ZXVlID0gW10sXHJcblx0XHQgICAgY2VudGVyID0gYm91bmRzLmdldENlbnRlcigpO1xyXG5cclxuXHRcdHZhciBqLCBpLCBwb2ludDtcclxuXHJcblx0XHRmb3IgKGogPSBib3VuZHMubWluLnk7IGogPD0gYm91bmRzLm1heC55OyBqKyspIHtcclxuXHRcdFx0Zm9yIChpID0gYm91bmRzLm1pbi54OyBpIDw9IGJvdW5kcy5tYXgueDsgaSsrKSB7XHJcblx0XHRcdFx0cG9pbnQgPSBuZXcgTC5Qb2ludChpLCBqKTtcclxuXHJcblx0XHRcdFx0aWYgKHRoaXMuX3RpbGVTaG91bGRCZUxvYWRlZChwb2ludCkpIHtcclxuXHRcdFx0XHRcdHF1ZXVlLnB1c2gocG9pbnQpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHZhciB0aWxlc1RvTG9hZCA9IHF1ZXVlLmxlbmd0aDtcclxuXHJcblx0XHRpZiAodGlsZXNUb0xvYWQgPT09IDApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0Ly8gbG9hZCB0aWxlcyBpbiBvcmRlciBvZiB0aGVpciBkaXN0YW5jZSB0byBjZW50ZXJcclxuXHRcdHF1ZXVlLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcclxuXHRcdFx0cmV0dXJuIGEuZGlzdGFuY2VUbyhjZW50ZXIpIC0gYi5kaXN0YW5jZVRvKGNlbnRlcik7XHJcblx0XHR9KTtcclxuXHJcblx0XHR2YXIgZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XHJcblxyXG5cdFx0Ly8gaWYgaXRzIHRoZSBmaXJzdCBiYXRjaCBvZiB0aWxlcyB0byBsb2FkXHJcblx0XHRpZiAoIXRoaXMuX3RpbGVzVG9Mb2FkKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbG9hZGluZycpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3RpbGVzVG9Mb2FkICs9IHRpbGVzVG9Mb2FkO1xyXG5cclxuXHRcdGZvciAoaSA9IDA7IGkgPCB0aWxlc1RvTG9hZDsgaSsrKSB7XHJcblx0XHRcdHRoaXMuX2FkZFRpbGUocXVldWVbaV0sIGZyYWdtZW50KTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl90aWxlQ29udGFpbmVyLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcclxuXHR9LFxyXG5cclxuXHRfdGlsZVNob3VsZEJlTG9hZGVkOiBmdW5jdGlvbiAodGlsZVBvaW50KSB7XHJcblx0XHRpZiAoKHRpbGVQb2ludC54ICsgJzonICsgdGlsZVBvaW50LnkpIGluIHRoaXMuX3RpbGVzKSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gYWxyZWFkeSBsb2FkZWRcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcclxuXHJcblx0XHRpZiAoIW9wdGlvbnMuY29udGludW91c1dvcmxkKSB7XHJcblx0XHRcdHZhciBsaW1pdCA9IHRoaXMuX2dldFdyYXBUaWxlTnVtKCk7XHJcblxyXG5cdFx0XHQvLyBkb24ndCBsb2FkIGlmIGV4Y2VlZHMgd29ybGQgYm91bmRzXHJcblx0XHRcdGlmICgob3B0aW9ucy5ub1dyYXAgJiYgKHRpbGVQb2ludC54IDwgMCB8fCB0aWxlUG9pbnQueCA+PSBsaW1pdC54KSkgfHxcclxuXHRcdFx0XHR0aWxlUG9pbnQueSA8IDAgfHwgdGlsZVBvaW50LnkgPj0gbGltaXQueSkgeyByZXR1cm4gZmFsc2U7IH1cclxuXHRcdH1cclxuXHJcblx0XHRpZiAob3B0aW9ucy5ib3VuZHMpIHtcclxuXHRcdFx0dmFyIHRpbGVTaXplID0gdGhpcy5fZ2V0VGlsZVNpemUoKSxcclxuXHRcdFx0ICAgIG53UG9pbnQgPSB0aWxlUG9pbnQubXVsdGlwbHlCeSh0aWxlU2l6ZSksXHJcblx0XHRcdCAgICBzZVBvaW50ID0gbndQb2ludC5hZGQoW3RpbGVTaXplLCB0aWxlU2l6ZV0pLFxyXG5cdFx0XHQgICAgbncgPSB0aGlzLl9tYXAudW5wcm9qZWN0KG53UG9pbnQpLFxyXG5cdFx0XHQgICAgc2UgPSB0aGlzLl9tYXAudW5wcm9qZWN0KHNlUG9pbnQpO1xyXG5cclxuXHRcdFx0Ly8gVE9ETyB0ZW1wb3JhcnkgaGFjaywgd2lsbCBiZSByZW1vdmVkIGFmdGVyIHJlZmFjdG9yaW5nIHByb2plY3Rpb25zXHJcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9MZWFmbGV0L0xlYWZsZXQvaXNzdWVzLzE2MThcclxuXHRcdFx0aWYgKCFvcHRpb25zLmNvbnRpbnVvdXNXb3JsZCAmJiAhb3B0aW9ucy5ub1dyYXApIHtcclxuXHRcdFx0XHRudyA9IG53LndyYXAoKTtcclxuXHRcdFx0XHRzZSA9IHNlLndyYXAoKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKCFvcHRpb25zLmJvdW5kcy5pbnRlcnNlY3RzKFtudywgc2VdKSkgeyByZXR1cm4gZmFsc2U7IH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdHJ1ZTtcclxuXHR9LFxyXG5cclxuXHRfcmVtb3ZlT3RoZXJUaWxlczogZnVuY3Rpb24gKGJvdW5kcykge1xyXG5cdFx0dmFyIGtBcnIsIHgsIHksIGtleTtcclxuXHJcblx0XHRmb3IgKGtleSBpbiB0aGlzLl90aWxlcykge1xyXG5cdFx0XHRrQXJyID0ga2V5LnNwbGl0KCc6Jyk7XHJcblx0XHRcdHggPSBwYXJzZUludChrQXJyWzBdLCAxMCk7XHJcblx0XHRcdHkgPSBwYXJzZUludChrQXJyWzFdLCAxMCk7XHJcblxyXG5cdFx0XHQvLyByZW1vdmUgdGlsZSBpZiBpdCdzIG91dCBvZiBib3VuZHNcclxuXHRcdFx0aWYgKHggPCBib3VuZHMubWluLnggfHwgeCA+IGJvdW5kcy5tYXgueCB8fCB5IDwgYm91bmRzLm1pbi55IHx8IHkgPiBib3VuZHMubWF4LnkpIHtcclxuXHRcdFx0XHR0aGlzLl9yZW1vdmVUaWxlKGtleSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfcmVtb3ZlVGlsZTogZnVuY3Rpb24gKGtleSkge1xyXG5cdFx0dmFyIHRpbGUgPSB0aGlzLl90aWxlc1trZXldO1xyXG5cclxuXHRcdHRoaXMuZmlyZSgndGlsZXVubG9hZCcsIHt0aWxlOiB0aWxlLCB1cmw6IHRpbGUuc3JjfSk7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZXVzZVRpbGVzKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aWxlLCAnbGVhZmxldC10aWxlLWxvYWRlZCcpO1xyXG5cdFx0XHR0aGlzLl91bnVzZWRUaWxlcy5wdXNoKHRpbGUpO1xyXG5cclxuXHRcdH0gZWxzZSBpZiAodGlsZS5wYXJlbnROb2RlID09PSB0aGlzLl90aWxlQ29udGFpbmVyKSB7XHJcblx0XHRcdHRoaXMuX3RpbGVDb250YWluZXIucmVtb3ZlQ2hpbGQodGlsZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9DbG91ZE1hZGUvTGVhZmxldC9pc3N1ZXMvMTM3XHJcblx0XHRpZiAoIUwuQnJvd3Nlci5hbmRyb2lkKSB7XHJcblx0XHRcdHRpbGUub25sb2FkID0gbnVsbDtcclxuXHRcdFx0dGlsZS5zcmMgPSBMLlV0aWwuZW1wdHlJbWFnZVVybDtcclxuXHRcdH1cclxuXHJcblx0XHRkZWxldGUgdGhpcy5fdGlsZXNba2V5XTtcclxuXHR9LFxyXG5cclxuXHRfYWRkVGlsZTogZnVuY3Rpb24gKHRpbGVQb2ludCwgY29udGFpbmVyKSB7XHJcblx0XHR2YXIgdGlsZVBvcyA9IHRoaXMuX2dldFRpbGVQb3ModGlsZVBvaW50KTtcclxuXHJcblx0XHQvLyBnZXQgdW51c2VkIHRpbGUgLSBvciBjcmVhdGUgYSBuZXcgdGlsZVxyXG5cdFx0dmFyIHRpbGUgPSB0aGlzLl9nZXRUaWxlKCk7XHJcblxyXG5cdFx0LypcclxuXHRcdENocm9tZSAyMCBsYXlvdXRzIG11Y2ggZmFzdGVyIHdpdGggdG9wL2xlZnQgKHZlcmlmeSB3aXRoIHRpbWVsaW5lLCBmcmFtZXMpXHJcblx0XHRBbmRyb2lkIDQgYnJvd3NlciBoYXMgZGlzcGxheSBpc3N1ZXMgd2l0aCB0b3AvbGVmdCBhbmQgcmVxdWlyZXMgdHJhbnNmb3JtIGluc3RlYWRcclxuXHRcdChvdGhlciBicm93c2VycyBkb24ndCBjdXJyZW50bHkgY2FyZSkgLSBzZWUgZGVidWcvaGFja3Mvaml0dGVyLmh0bWwgZm9yIGFuIGV4YW1wbGVcclxuXHRcdCovXHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24odGlsZSwgdGlsZVBvcywgTC5Ccm93c2VyLmNocm9tZSk7XHJcblxyXG5cdFx0dGhpcy5fdGlsZXNbdGlsZVBvaW50LnggKyAnOicgKyB0aWxlUG9pbnQueV0gPSB0aWxlO1xyXG5cclxuXHRcdHRoaXMuX2xvYWRUaWxlKHRpbGUsIHRpbGVQb2ludCk7XHJcblxyXG5cdFx0aWYgKHRpbGUucGFyZW50Tm9kZSAhPT0gdGhpcy5fdGlsZUNvbnRhaW5lcikge1xyXG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGlsZSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2dldFpvb21Gb3JVcmw6IGZ1bmN0aW9uICgpIHtcclxuXHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucyxcclxuXHRcdCAgICB6b29tID0gdGhpcy5fbWFwLmdldFpvb20oKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy56b29tUmV2ZXJzZSkge1xyXG5cdFx0XHR6b29tID0gb3B0aW9ucy5tYXhab29tIC0gem9vbTtcclxuXHRcdH1cclxuXHJcblx0XHR6b29tICs9IG9wdGlvbnMuem9vbU9mZnNldDtcclxuXHJcblx0XHRyZXR1cm4gb3B0aW9ucy5tYXhOYXRpdmVab29tID8gTWF0aC5taW4oem9vbSwgb3B0aW9ucy5tYXhOYXRpdmVab29tKSA6IHpvb207XHJcblx0fSxcclxuXHJcblx0X2dldFRpbGVQb3M6IGZ1bmN0aW9uICh0aWxlUG9pbnQpIHtcclxuXHRcdHZhciBvcmlnaW4gPSB0aGlzLl9tYXAuZ2V0UGl4ZWxPcmlnaW4oKSxcclxuXHRcdCAgICB0aWxlU2l6ZSA9IHRoaXMuX2dldFRpbGVTaXplKCk7XHJcblxyXG5cdFx0cmV0dXJuIHRpbGVQb2ludC5tdWx0aXBseUJ5KHRpbGVTaXplKS5zdWJ0cmFjdChvcmlnaW4pO1xyXG5cdH0sXHJcblxyXG5cdC8vIGltYWdlLXNwZWNpZmljIGNvZGUgKG92ZXJyaWRlIHRvIGltcGxlbWVudCBlLmcuIENhbnZhcyBvciBTVkcgdGlsZSBsYXllcilcclxuXHJcblx0Z2V0VGlsZVVybDogZnVuY3Rpb24gKHRpbGVQb2ludCkge1xyXG5cdFx0cmV0dXJuIEwuVXRpbC50ZW1wbGF0ZSh0aGlzLl91cmwsIEwuZXh0ZW5kKHtcclxuXHRcdFx0czogdGhpcy5fZ2V0U3ViZG9tYWluKHRpbGVQb2ludCksXHJcblx0XHRcdHo6IHRpbGVQb2ludC56LFxyXG5cdFx0XHR4OiB0aWxlUG9pbnQueCxcclxuXHRcdFx0eTogdGlsZVBvaW50LnlcclxuXHRcdH0sIHRoaXMub3B0aW9ucykpO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRXcmFwVGlsZU51bTogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGNycyA9IHRoaXMuX21hcC5vcHRpb25zLmNycyxcclxuXHRcdCAgICBzaXplID0gY3JzLmdldFNpemUodGhpcy5fbWFwLmdldFpvb20oKSk7XHJcblx0XHRyZXR1cm4gc2l6ZS5kaXZpZGVCeSh0aGlzLl9nZXRUaWxlU2l6ZSgpKS5fZmxvb3IoKTtcclxuXHR9LFxyXG5cclxuXHRfYWRqdXN0VGlsZVBvaW50OiBmdW5jdGlvbiAodGlsZVBvaW50KSB7XHJcblxyXG5cdFx0dmFyIGxpbWl0ID0gdGhpcy5fZ2V0V3JhcFRpbGVOdW0oKTtcclxuXHJcblx0XHQvLyB3cmFwIHRpbGUgY29vcmRpbmF0ZXNcclxuXHRcdGlmICghdGhpcy5vcHRpb25zLmNvbnRpbnVvdXNXb3JsZCAmJiAhdGhpcy5vcHRpb25zLm5vV3JhcCkge1xyXG5cdFx0XHR0aWxlUG9pbnQueCA9ICgodGlsZVBvaW50LnggJSBsaW1pdC54KSArIGxpbWl0LngpICUgbGltaXQueDtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnRtcykge1xyXG5cdFx0XHR0aWxlUG9pbnQueSA9IGxpbWl0LnkgLSB0aWxlUG9pbnQueSAtIDE7XHJcblx0XHR9XHJcblxyXG5cdFx0dGlsZVBvaW50LnogPSB0aGlzLl9nZXRab29tRm9yVXJsKCk7XHJcblx0fSxcclxuXHJcblx0X2dldFN1YmRvbWFpbjogZnVuY3Rpb24gKHRpbGVQb2ludCkge1xyXG5cdFx0dmFyIGluZGV4ID0gTWF0aC5hYnModGlsZVBvaW50LnggKyB0aWxlUG9pbnQueSkgJSB0aGlzLm9wdGlvbnMuc3ViZG9tYWlucy5sZW5ndGg7XHJcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLnN1YmRvbWFpbnNbaW5kZXhdO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRUaWxlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnJldXNlVGlsZXMgJiYgdGhpcy5fdW51c2VkVGlsZXMubGVuZ3RoID4gMCkge1xyXG5cdFx0XHR2YXIgdGlsZSA9IHRoaXMuX3VudXNlZFRpbGVzLnBvcCgpO1xyXG5cdFx0XHR0aGlzLl9yZXNldFRpbGUodGlsZSk7XHJcblx0XHRcdHJldHVybiB0aWxlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVRpbGUoKTtcclxuXHR9LFxyXG5cclxuXHQvLyBPdmVycmlkZSBpZiBkYXRhIHN0b3JlZCBvbiBhIHRpbGUgbmVlZHMgdG8gYmUgY2xlYW5lZCB1cCBiZWZvcmUgcmV1c2VcclxuXHRfcmVzZXRUaWxlOiBmdW5jdGlvbiAoLyp0aWxlKi8pIHt9LFxyXG5cclxuXHRfY3JlYXRlVGlsZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHRpbGUgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbWcnLCAnbGVhZmxldC10aWxlJyk7XHJcblx0XHR0aWxlLnN0eWxlLndpZHRoID0gdGlsZS5zdHlsZS5oZWlnaHQgPSB0aGlzLl9nZXRUaWxlU2l6ZSgpICsgJ3B4JztcclxuXHRcdHRpbGUuZ2FsbGVyeWltZyA9ICdubyc7XHJcblxyXG5cdFx0dGlsZS5vbnNlbGVjdHN0YXJ0ID0gdGlsZS5vbm1vdXNlbW92ZSA9IEwuVXRpbC5mYWxzZUZuO1xyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIuaWVsdDkgJiYgdGhpcy5vcHRpb25zLm9wYWNpdHkgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aWxlLCB0aGlzLm9wdGlvbnMub3BhY2l0eSk7XHJcblx0XHR9XHJcblx0XHQvLyB3aXRob3V0IHRoaXMgaGFjaywgdGlsZXMgZGlzYXBwZWFyIGFmdGVyIHpvb20gb24gQ2hyb21lIGZvciBBbmRyb2lkXHJcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vTGVhZmxldC9MZWFmbGV0L2lzc3Vlcy8yMDc4XHJcblx0XHRpZiAoTC5Ccm93c2VyLm1vYmlsZVdlYmtpdDNkKSB7XHJcblx0XHRcdHRpbGUuc3R5bGUuV2Via2l0QmFja2ZhY2VWaXNpYmlsaXR5ID0gJ2hpZGRlbic7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGlsZTtcclxuXHR9LFxyXG5cclxuXHRfbG9hZFRpbGU6IGZ1bmN0aW9uICh0aWxlLCB0aWxlUG9pbnQpIHtcclxuXHRcdHRpbGUuX2xheWVyICA9IHRoaXM7XHJcblx0XHR0aWxlLm9ubG9hZCAgPSB0aGlzLl90aWxlT25Mb2FkO1xyXG5cdFx0dGlsZS5vbmVycm9yID0gdGhpcy5fdGlsZU9uRXJyb3I7XHJcblxyXG5cdFx0dGhpcy5fYWRqdXN0VGlsZVBvaW50KHRpbGVQb2ludCk7XHJcblx0XHR0aWxlLnNyYyAgICAgPSB0aGlzLmdldFRpbGVVcmwodGlsZVBvaW50KTtcclxuXHJcblx0XHR0aGlzLmZpcmUoJ3RpbGVsb2Fkc3RhcnQnLCB7XHJcblx0XHRcdHRpbGU6IHRpbGUsXHJcblx0XHRcdHVybDogdGlsZS5zcmNcclxuXHRcdH0pO1xyXG5cdH0sXHJcblxyXG5cdF90aWxlTG9hZGVkOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl90aWxlc1RvTG9hZC0tO1xyXG5cclxuXHRcdGlmICh0aGlzLl9hbmltYXRlZCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fdGlsZUNvbnRhaW5lciwgJ2xlYWZsZXQtem9vbS1hbmltYXRlZCcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICghdGhpcy5fdGlsZXNUb0xvYWQpIHtcclxuXHRcdFx0dGhpcy5maXJlKCdsb2FkJyk7XHJcblxyXG5cdFx0XHRpZiAodGhpcy5fYW5pbWF0ZWQpIHtcclxuXHRcdFx0XHQvLyBjbGVhciBzY2FsZWQgdGlsZXMgYWZ0ZXIgYWxsIG5ldyB0aWxlcyBhcmUgbG9hZGVkIChmb3IgcGVyZm9ybWFuY2UpXHJcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2NsZWFyQmdCdWZmZXJUaW1lcik7XHJcblx0XHRcdFx0dGhpcy5fY2xlYXJCZ0J1ZmZlclRpbWVyID0gc2V0VGltZW91dChMLmJpbmQodGhpcy5fY2xlYXJCZ0J1ZmZlciwgdGhpcyksIDUwMCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdGlsZU9uTG9hZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxheWVyID0gdGhpcy5fbGF5ZXI7XHJcblxyXG5cdFx0Ly9Pbmx5IGlmIHdlIGFyZSBsb2FkaW5nIGFuIGFjdHVhbCBpbWFnZVxyXG5cdFx0aWYgKHRoaXMuc3JjICE9PSBMLlV0aWwuZW1wdHlJbWFnZVVybCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcywgJ2xlYWZsZXQtdGlsZS1sb2FkZWQnKTtcclxuXHJcblx0XHRcdGxheWVyLmZpcmUoJ3RpbGVsb2FkJywge1xyXG5cdFx0XHRcdHRpbGU6IHRoaXMsXHJcblx0XHRcdFx0dXJsOiB0aGlzLnNyY1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHJcblx0XHRsYXllci5fdGlsZUxvYWRlZCgpO1xyXG5cdH0sXHJcblxyXG5cdF90aWxlT25FcnJvcjogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxheWVyID0gdGhpcy5fbGF5ZXI7XHJcblxyXG5cdFx0bGF5ZXIuZmlyZSgndGlsZWVycm9yJywge1xyXG5cdFx0XHR0aWxlOiB0aGlzLFxyXG5cdFx0XHR1cmw6IHRoaXMuc3JjXHJcblx0XHR9KTtcclxuXHJcblx0XHR2YXIgbmV3VXJsID0gbGF5ZXIub3B0aW9ucy5lcnJvclRpbGVVcmw7XHJcblx0XHRpZiAobmV3VXJsKSB7XHJcblx0XHRcdHRoaXMuc3JjID0gbmV3VXJsO1xyXG5cdFx0fVxyXG5cclxuXHRcdGxheWVyLl90aWxlTG9hZGVkKCk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwudGlsZUxheWVyID0gZnVuY3Rpb24gKHVybCwgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5UaWxlTGF5ZXIodXJsLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuVGlsZUxheWVyLldNUyBpcyB1c2VkIGZvciBwdXR0aW5nIFdNUyB0aWxlIGxheWVycyBvbiB0aGUgbWFwLlxyXG4gKi9cclxuXHJcbkwuVGlsZUxheWVyLldNUyA9IEwuVGlsZUxheWVyLmV4dGVuZCh7XHJcblxyXG5cdGRlZmF1bHRXbXNQYXJhbXM6IHtcclxuXHRcdHNlcnZpY2U6ICdXTVMnLFxyXG5cdFx0cmVxdWVzdDogJ0dldE1hcCcsXHJcblx0XHR2ZXJzaW9uOiAnMS4xLjEnLFxyXG5cdFx0bGF5ZXJzOiAnJyxcclxuXHRcdHN0eWxlczogJycsXHJcblx0XHRmb3JtYXQ6ICdpbWFnZS9qcGVnJyxcclxuXHRcdHRyYW5zcGFyZW50OiBmYWxzZVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICh1cmwsIG9wdGlvbnMpIHsgLy8gKFN0cmluZywgT2JqZWN0KVxyXG5cclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHJcblx0XHR2YXIgd21zUGFyYW1zID0gTC5leHRlbmQoe30sIHRoaXMuZGVmYXVsdFdtc1BhcmFtcyksXHJcblx0XHQgICAgdGlsZVNpemUgPSBvcHRpb25zLnRpbGVTaXplIHx8IHRoaXMub3B0aW9ucy50aWxlU2l6ZTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5kZXRlY3RSZXRpbmEgJiYgTC5Ccm93c2VyLnJldGluYSkge1xyXG5cdFx0XHR3bXNQYXJhbXMud2lkdGggPSB3bXNQYXJhbXMuaGVpZ2h0ID0gdGlsZVNpemUgKiAyO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0d21zUGFyYW1zLndpZHRoID0gd21zUGFyYW1zLmhlaWdodCA9IHRpbGVTaXplO1xyXG5cdFx0fVxyXG5cclxuXHRcdGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xyXG5cdFx0XHQvLyBhbGwga2V5cyB0aGF0IGFyZSBub3QgVGlsZUxheWVyIG9wdGlvbnMgZ28gdG8gV01TIHBhcmFtc1xyXG5cdFx0XHRpZiAoIXRoaXMub3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShpKSAmJiBpICE9PSAnY3JzJykge1xyXG5cdFx0XHRcdHdtc1BhcmFtc1tpXSA9IG9wdGlvbnNbaV07XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLndtc1BhcmFtcyA9IHdtc1BhcmFtcztcclxuXHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHJcblx0XHR0aGlzLl9jcnMgPSB0aGlzLm9wdGlvbnMuY3JzIHx8IG1hcC5vcHRpb25zLmNycztcclxuXHJcblx0XHR0aGlzLl93bXNWZXJzaW9uID0gcGFyc2VGbG9hdCh0aGlzLndtc1BhcmFtcy52ZXJzaW9uKTtcclxuXHJcblx0XHR2YXIgcHJvamVjdGlvbktleSA9IHRoaXMuX3dtc1ZlcnNpb24gPj0gMS4zID8gJ2NycycgOiAnc3JzJztcclxuXHRcdHRoaXMud21zUGFyYW1zW3Byb2plY3Rpb25LZXldID0gdGhpcy5fY3JzLmNvZGU7XHJcblxyXG5cdFx0TC5UaWxlTGF5ZXIucHJvdG90eXBlLm9uQWRkLmNhbGwodGhpcywgbWFwKTtcclxuXHR9LFxyXG5cclxuXHRnZXRUaWxlVXJsOiBmdW5jdGlvbiAodGlsZVBvaW50KSB7IC8vIChQb2ludCwgTnVtYmVyKSAtPiBTdHJpbmdcclxuXHJcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwLFxyXG5cdFx0ICAgIHRpbGVTaXplID0gdGhpcy5vcHRpb25zLnRpbGVTaXplLFxyXG5cclxuXHRcdCAgICBud1BvaW50ID0gdGlsZVBvaW50Lm11bHRpcGx5QnkodGlsZVNpemUpLFxyXG5cdFx0ICAgIHNlUG9pbnQgPSBud1BvaW50LmFkZChbdGlsZVNpemUsIHRpbGVTaXplXSksXHJcblxyXG5cdFx0ICAgIG53ID0gdGhpcy5fY3JzLnByb2plY3QobWFwLnVucHJvamVjdChud1BvaW50LCB0aWxlUG9pbnQueikpLFxyXG5cdFx0ICAgIHNlID0gdGhpcy5fY3JzLnByb2plY3QobWFwLnVucHJvamVjdChzZVBvaW50LCB0aWxlUG9pbnQueikpLFxyXG5cdFx0ICAgIGJib3ggPSB0aGlzLl93bXNWZXJzaW9uID49IDEuMyAmJiB0aGlzLl9jcnMgPT09IEwuQ1JTLkVQU0c0MzI2ID9cclxuXHRcdCAgICAgICAgW3NlLnksIG53LngsIG53LnksIHNlLnhdLmpvaW4oJywnKSA6XHJcblx0XHQgICAgICAgIFtudy54LCBzZS55LCBzZS54LCBudy55XS5qb2luKCcsJyksXHJcblxyXG5cdFx0ICAgIHVybCA9IEwuVXRpbC50ZW1wbGF0ZSh0aGlzLl91cmwsIHtzOiB0aGlzLl9nZXRTdWJkb21haW4odGlsZVBvaW50KX0pO1xyXG5cclxuXHRcdHJldHVybiB1cmwgKyBMLlV0aWwuZ2V0UGFyYW1TdHJpbmcodGhpcy53bXNQYXJhbXMsIHVybCwgdHJ1ZSkgKyAnJkJCT1g9JyArIGJib3g7XHJcblx0fSxcclxuXHJcblx0c2V0UGFyYW1zOiBmdW5jdGlvbiAocGFyYW1zLCBub1JlZHJhdykge1xyXG5cclxuXHRcdEwuZXh0ZW5kKHRoaXMud21zUGFyYW1zLCBwYXJhbXMpO1xyXG5cclxuXHRcdGlmICghbm9SZWRyYXcpIHtcclxuXHRcdFx0dGhpcy5yZWRyYXcoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9XHJcbn0pO1xyXG5cclxuTC50aWxlTGF5ZXIud21zID0gZnVuY3Rpb24gKHVybCwgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5UaWxlTGF5ZXIuV01TKHVybCwgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLlRpbGVMYXllci5DYW52YXMgaXMgYSBjbGFzcyB0aGF0IHlvdSBjYW4gdXNlIGFzIGEgYmFzZSBmb3IgY3JlYXRpbmdcclxuICogZHluYW1pY2FsbHkgZHJhd24gQ2FudmFzLWJhc2VkIHRpbGUgbGF5ZXJzLlxyXG4gKi9cclxuXHJcbkwuVGlsZUxheWVyLkNhbnZhcyA9IEwuVGlsZUxheWVyLmV4dGVuZCh7XHJcblx0b3B0aW9uczoge1xyXG5cdFx0YXN5bmM6IGZhbHNlXHJcblx0fSxcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRyZWRyYXc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9tYXApIHtcclxuXHRcdFx0dGhpcy5fcmVzZXQoe2hhcmQ6IHRydWV9KTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLl90aWxlcykge1xyXG5cdFx0XHR0aGlzLl9yZWRyYXdUaWxlKHRoaXMuX3RpbGVzW2ldKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF9yZWRyYXdUaWxlOiBmdW5jdGlvbiAodGlsZSkge1xyXG5cdFx0dGhpcy5kcmF3VGlsZSh0aWxlLCB0aWxlLl90aWxlUG9pbnQsIHRoaXMuX21hcC5fem9vbSk7XHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZVRpbGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciB0aWxlID0gTC5Eb21VdGlsLmNyZWF0ZSgnY2FudmFzJywgJ2xlYWZsZXQtdGlsZScpO1xyXG5cdFx0dGlsZS53aWR0aCA9IHRpbGUuaGVpZ2h0ID0gdGhpcy5vcHRpb25zLnRpbGVTaXplO1xyXG5cdFx0dGlsZS5vbnNlbGVjdHN0YXJ0ID0gdGlsZS5vbm1vdXNlbW92ZSA9IEwuVXRpbC5mYWxzZUZuO1xyXG5cdFx0cmV0dXJuIHRpbGU7XHJcblx0fSxcclxuXHJcblx0X2xvYWRUaWxlOiBmdW5jdGlvbiAodGlsZSwgdGlsZVBvaW50KSB7XHJcblx0XHR0aWxlLl9sYXllciA9IHRoaXM7XHJcblx0XHR0aWxlLl90aWxlUG9pbnQgPSB0aWxlUG9pbnQ7XHJcblxyXG5cdFx0dGhpcy5fcmVkcmF3VGlsZSh0aWxlKTtcclxuXHJcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5hc3luYykge1xyXG5cdFx0XHR0aGlzLnRpbGVEcmF3bih0aWxlKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRkcmF3VGlsZTogZnVuY3Rpb24gKC8qdGlsZSwgdGlsZVBvaW50Ki8pIHtcclxuXHRcdC8vIG92ZXJyaWRlIHdpdGggcmVuZGVyaW5nIGNvZGVcclxuXHR9LFxyXG5cclxuXHR0aWxlRHJhd246IGZ1bmN0aW9uICh0aWxlKSB7XHJcblx0XHR0aGlzLl90aWxlT25Mb2FkLmNhbGwodGlsZSk7XHJcblx0fVxyXG59KTtcclxuXHJcblxyXG5MLnRpbGVMYXllci5jYW52YXMgPSBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5UaWxlTGF5ZXIuQ2FudmFzKG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5JbWFnZU92ZXJsYXkgaXMgdXNlZCB0byBvdmVybGF5IGltYWdlcyBvdmVyIHRoZSBtYXAgKHRvIHNwZWNpZmljIGdlb2dyYXBoaWNhbCBib3VuZHMpLlxyXG4gKi9cclxuXHJcbkwuSW1hZ2VPdmVybGF5ID0gTC5DbGFzcy5leHRlbmQoe1xyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0b3BhY2l0eTogMVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICh1cmwsIGJvdW5kcywgb3B0aW9ucykgeyAvLyAoU3RyaW5nLCBMYXRMbmdCb3VuZHMsIE9iamVjdClcclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHRcdHRoaXMuX2JvdW5kcyA9IEwubGF0TG5nQm91bmRzKGJvdW5kcyk7XHJcblxyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdG9uQWRkOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLl9tYXAgPSBtYXA7XHJcblxyXG5cdFx0aWYgKCF0aGlzLl9pbWFnZSkge1xyXG5cdFx0XHR0aGlzLl9pbml0SW1hZ2UoKTtcclxuXHRcdH1cclxuXHJcblx0XHRtYXAuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHRoaXMuX2ltYWdlKTtcclxuXHJcblx0XHRtYXAub24oJ3ZpZXdyZXNldCcsIHRoaXMuX3Jlc2V0LCB0aGlzKTtcclxuXHJcblx0XHRpZiAobWFwLm9wdGlvbnMuem9vbUFuaW1hdGlvbiAmJiBMLkJyb3dzZXIuYW55M2QpIHtcclxuXHRcdFx0bWFwLm9uKCd6b29tYW5pbScsIHRoaXMuX2FuaW1hdGVab29tLCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9yZXNldCgpO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuZ2V0UGFuZXMoKS5vdmVybGF5UGFuZS5yZW1vdmVDaGlsZCh0aGlzLl9pbWFnZSk7XHJcblxyXG5cdFx0bWFwLm9mZigndmlld3Jlc2V0JywgdGhpcy5fcmVzZXQsIHRoaXMpO1xyXG5cclxuXHRcdGlmIChtYXAub3B0aW9ucy56b29tQW5pbWF0aW9uKSB7XHJcblx0XHRcdG1hcC5vZmYoJ3pvb21hbmltJywgdGhpcy5fYW5pbWF0ZVpvb20sIHRoaXMpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRPcGFjaXR5OiBmdW5jdGlvbiAob3BhY2l0eSkge1xyXG5cdFx0dGhpcy5vcHRpb25zLm9wYWNpdHkgPSBvcGFjaXR5O1xyXG5cdFx0dGhpcy5fdXBkYXRlT3BhY2l0eSgpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Ly8gVE9ETyByZW1vdmUgYnJpbmdUb0Zyb250L2JyaW5nVG9CYWNrIGR1cGxpY2F0aW9uIGZyb20gVGlsZUxheWVyL1BhdGhcclxuXHRicmluZ1RvRnJvbnQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9pbWFnZSkge1xyXG5cdFx0XHR0aGlzLl9tYXAuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHRoaXMuX2ltYWdlKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGJyaW5nVG9CYWNrOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgcGFuZSA9IHRoaXMuX21hcC5fcGFuZXMub3ZlcmxheVBhbmU7XHJcblx0XHRpZiAodGhpcy5faW1hZ2UpIHtcclxuXHRcdFx0cGFuZS5pbnNlcnRCZWZvcmUodGhpcy5faW1hZ2UsIHBhbmUuZmlyc3RDaGlsZCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRVcmw6IGZ1bmN0aW9uICh1cmwpIHtcclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHRcdHRoaXMuX2ltYWdlLnNyYyA9IHRoaXMuX3VybDtcclxuXHR9LFxyXG5cclxuXHRnZXRBdHRyaWJ1dGlvbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5hdHRyaWJ1dGlvbjtcclxuXHR9LFxyXG5cclxuXHRfaW5pdEltYWdlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9pbWFnZSA9IEwuRG9tVXRpbC5jcmVhdGUoJ2ltZycsICdsZWFmbGV0LWltYWdlLWxheWVyJyk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX21hcC5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgTC5Ccm93c2VyLmFueTNkKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9pbWFnZSwgJ2xlYWZsZXQtem9vbS1hbmltYXRlZCcpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2ltYWdlLCAnbGVhZmxldC16b29tLWhpZGUnKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl91cGRhdGVPcGFjaXR5KCk7XHJcblxyXG5cdFx0Ly9UT0RPIGNyZWF0ZUltYWdlIHV0aWwgbWV0aG9kIHRvIHJlbW92ZSBkdXBsaWNhdGlvblxyXG5cdFx0TC5leHRlbmQodGhpcy5faW1hZ2UsIHtcclxuXHRcdFx0Z2FsbGVyeWltZzogJ25vJyxcclxuXHRcdFx0b25zZWxlY3RzdGFydDogTC5VdGlsLmZhbHNlRm4sXHJcblx0XHRcdG9ubW91c2Vtb3ZlOiBMLlV0aWwuZmFsc2VGbixcclxuXHRcdFx0b25sb2FkOiBMLmJpbmQodGhpcy5fb25JbWFnZUxvYWQsIHRoaXMpLFxyXG5cdFx0XHRzcmM6IHRoaXMuX3VybFxyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0X2FuaW1hdGVab29tOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcclxuXHRcdCAgICBpbWFnZSA9IHRoaXMuX2ltYWdlLFxyXG5cdFx0ICAgIHNjYWxlID0gbWFwLmdldFpvb21TY2FsZShlLnpvb20pLFxyXG5cdFx0ICAgIG53ID0gdGhpcy5fYm91bmRzLmdldE5vcnRoV2VzdCgpLFxyXG5cdFx0ICAgIHNlID0gdGhpcy5fYm91bmRzLmdldFNvdXRoRWFzdCgpLFxyXG5cclxuXHRcdCAgICB0b3BMZWZ0ID0gbWFwLl9sYXRMbmdUb05ld0xheWVyUG9pbnQobncsIGUuem9vbSwgZS5jZW50ZXIpLFxyXG5cdFx0ICAgIHNpemUgPSBtYXAuX2xhdExuZ1RvTmV3TGF5ZXJQb2ludChzZSwgZS56b29tLCBlLmNlbnRlcikuX3N1YnRyYWN0KHRvcExlZnQpLFxyXG5cdFx0ICAgIG9yaWdpbiA9IHRvcExlZnQuX2FkZChzaXplLl9tdWx0aXBseUJ5KCgxIC8gMikgKiAoMSAtIDEgLyBzY2FsZSkpKTtcclxuXHJcblx0XHRpbWFnZS5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9XHJcblx0XHQgICAgICAgIEwuRG9tVXRpbC5nZXRUcmFuc2xhdGVTdHJpbmcob3JpZ2luKSArICcgc2NhbGUoJyArIHNjYWxlICsgJykgJztcclxuXHR9LFxyXG5cclxuXHRfcmVzZXQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBpbWFnZSAgID0gdGhpcy5faW1hZ2UsXHJcblx0XHQgICAgdG9wTGVmdCA9IHRoaXMuX21hcC5sYXRMbmdUb0xheWVyUG9pbnQodGhpcy5fYm91bmRzLmdldE5vcnRoV2VzdCgpKSxcclxuXHRcdCAgICBzaXplID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9ib3VuZHMuZ2V0U291dGhFYXN0KCkpLl9zdWJ0cmFjdCh0b3BMZWZ0KTtcclxuXHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24oaW1hZ2UsIHRvcExlZnQpO1xyXG5cclxuXHRcdGltYWdlLnN0eWxlLndpZHRoICA9IHNpemUueCArICdweCc7XHJcblx0XHRpbWFnZS5zdHlsZS5oZWlnaHQgPSBzaXplLnkgKyAncHgnO1xyXG5cdH0sXHJcblxyXG5cdF9vbkltYWdlTG9hZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5maXJlKCdsb2FkJyk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZU9wYWNpdHk6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuRG9tVXRpbC5zZXRPcGFjaXR5KHRoaXMuX2ltYWdlLCB0aGlzLm9wdGlvbnMub3BhY2l0eSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuaW1hZ2VPdmVybGF5ID0gZnVuY3Rpb24gKHVybCwgYm91bmRzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkltYWdlT3ZlcmxheSh1cmwsIGJvdW5kcywgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLkljb24gaXMgYW4gaW1hZ2UtYmFzZWQgaWNvbiBjbGFzcyB0aGF0IHlvdSBjYW4gdXNlIHdpdGggTC5NYXJrZXIgZm9yIGN1c3RvbSBtYXJrZXJzLlxyXG4gKi9cclxuXHJcbkwuSWNvbiA9IEwuQ2xhc3MuZXh0ZW5kKHtcclxuXHRvcHRpb25zOiB7XHJcblx0XHQvKlxyXG5cdFx0aWNvblVybDogKFN0cmluZykgKHJlcXVpcmVkKVxyXG5cdFx0aWNvblJldGluYVVybDogKFN0cmluZykgKG9wdGlvbmFsLCB1c2VkIGZvciByZXRpbmEgZGV2aWNlcyBpZiBkZXRlY3RlZClcclxuXHRcdGljb25TaXplOiAoUG9pbnQpIChjYW4gYmUgc2V0IHRocm91Z2ggQ1NTKVxyXG5cdFx0aWNvbkFuY2hvcjogKFBvaW50KSAoY2VudGVyZWQgYnkgZGVmYXVsdCwgY2FuIGJlIHNldCBpbiBDU1Mgd2l0aCBuZWdhdGl2ZSBtYXJnaW5zKVxyXG5cdFx0cG9wdXBBbmNob3I6IChQb2ludCkgKGlmIG5vdCBzcGVjaWZpZWQsIHBvcHVwIG9wZW5zIGluIHRoZSBhbmNob3IgcG9pbnQpXHJcblx0XHRzaGFkb3dVcmw6IChTdHJpbmcpIChubyBzaGFkb3cgYnkgZGVmYXVsdClcclxuXHRcdHNoYWRvd1JldGluYVVybDogKFN0cmluZykgKG9wdGlvbmFsLCB1c2VkIGZvciByZXRpbmEgZGV2aWNlcyBpZiBkZXRlY3RlZClcclxuXHRcdHNoYWRvd1NpemU6IChQb2ludClcclxuXHRcdHNoYWRvd0FuY2hvcjogKFBvaW50KVxyXG5cdFx0Ki9cclxuXHRcdGNsYXNzTmFtZTogJydcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZUljb246IGZ1bmN0aW9uIChvbGRJY29uKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlSWNvbignaWNvbicsIG9sZEljb24pO1xyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZVNoYWRvdzogZnVuY3Rpb24gKG9sZEljb24pIHtcclxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVJY29uKCdzaGFkb3cnLCBvbGRJY29uKTtcclxuXHR9LFxyXG5cclxuXHRfY3JlYXRlSWNvbjogZnVuY3Rpb24gKG5hbWUsIG9sZEljb24pIHtcclxuXHRcdHZhciBzcmMgPSB0aGlzLl9nZXRJY29uVXJsKG5hbWUpO1xyXG5cclxuXHRcdGlmICghc3JjKSB7XHJcblx0XHRcdGlmIChuYW1lID09PSAnaWNvbicpIHtcclxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ljb25Vcmwgbm90IHNldCBpbiBJY29uIG9wdGlvbnMgKHNlZSB0aGUgZG9jcykuJyk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIG51bGw7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGltZztcclxuXHRcdGlmICghb2xkSWNvbiB8fCBvbGRJY29uLnRhZ05hbWUgIT09ICdJTUcnKSB7XHJcblx0XHRcdGltZyA9IHRoaXMuX2NyZWF0ZUltZyhzcmMpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aW1nID0gdGhpcy5fY3JlYXRlSW1nKHNyYywgb2xkSWNvbik7XHJcblx0XHR9XHJcblx0XHR0aGlzLl9zZXRJY29uU3R5bGVzKGltZywgbmFtZSk7XHJcblxyXG5cdFx0cmV0dXJuIGltZztcclxuXHR9LFxyXG5cclxuXHRfc2V0SWNvblN0eWxlczogZnVuY3Rpb24gKGltZywgbmFtZSkge1xyXG5cdFx0dmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMsXHJcblx0XHQgICAgc2l6ZSA9IEwucG9pbnQob3B0aW9uc1tuYW1lICsgJ1NpemUnXSksXHJcblx0XHQgICAgYW5jaG9yO1xyXG5cclxuXHRcdGlmIChuYW1lID09PSAnc2hhZG93Jykge1xyXG5cdFx0XHRhbmNob3IgPSBMLnBvaW50KG9wdGlvbnMuc2hhZG93QW5jaG9yIHx8IG9wdGlvbnMuaWNvbkFuY2hvcik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRhbmNob3IgPSBMLnBvaW50KG9wdGlvbnMuaWNvbkFuY2hvcik7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCFhbmNob3IgJiYgc2l6ZSkge1xyXG5cdFx0XHRhbmNob3IgPSBzaXplLmRpdmlkZUJ5KDIsIHRydWUpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGltZy5jbGFzc05hbWUgPSAnbGVhZmxldC1tYXJrZXItJyArIG5hbWUgKyAnICcgKyBvcHRpb25zLmNsYXNzTmFtZTtcclxuXHJcblx0XHRpZiAoYW5jaG9yKSB7XHJcblx0XHRcdGltZy5zdHlsZS5tYXJnaW5MZWZ0ID0gKC1hbmNob3IueCkgKyAncHgnO1xyXG5cdFx0XHRpbWcuc3R5bGUubWFyZ2luVG9wICA9ICgtYW5jaG9yLnkpICsgJ3B4JztcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoc2l6ZSkge1xyXG5cdFx0XHRpbWcuc3R5bGUud2lkdGggID0gc2l6ZS54ICsgJ3B4JztcclxuXHRcdFx0aW1nLnN0eWxlLmhlaWdodCA9IHNpemUueSArICdweCc7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZUltZzogZnVuY3Rpb24gKHNyYywgZWwpIHtcclxuXHRcdGVsID0gZWwgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW1nJyk7XHJcblx0XHRlbC5zcmMgPSBzcmM7XHJcblx0XHRyZXR1cm4gZWw7XHJcblx0fSxcclxuXHJcblx0X2dldEljb25Vcmw6IGZ1bmN0aW9uIChuYW1lKSB7XHJcblx0XHRpZiAoTC5Ccm93c2VyLnJldGluYSAmJiB0aGlzLm9wdGlvbnNbbmFtZSArICdSZXRpbmFVcmwnXSkge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5vcHRpb25zW25hbWUgKyAnUmV0aW5hVXJsJ107XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zW25hbWUgKyAnVXJsJ107XHJcblx0fVxyXG59KTtcclxuXHJcbkwuaWNvbiA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkljb24ob3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxuICogTC5JY29uLkRlZmF1bHQgaXMgdGhlIGJsdWUgbWFya2VyIGljb24gdXNlZCBieSBkZWZhdWx0IGluIExlYWZsZXQuXG4gKi9cblxuTC5JY29uLkRlZmF1bHQgPSBMLkljb24uZXh0ZW5kKHtcblxuXHRvcHRpb25zOiB7XG5cdFx0aWNvblNpemU6IFsyNSwgNDFdLFxuXHRcdGljb25BbmNob3I6IFsxMiwgNDFdLFxuXHRcdHBvcHVwQW5jaG9yOiBbMSwgLTM0XSxcblxuXHRcdHNoYWRvd1NpemU6IFs0MSwgNDFdXG5cdH0sXG5cblx0X2dldEljb25Vcmw6IGZ1bmN0aW9uIChuYW1lKSB7XG5cdFx0dmFyIGtleSA9IG5hbWUgKyAnVXJsJztcblxuXHRcdGlmICh0aGlzLm9wdGlvbnNba2V5XSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3B0aW9uc1trZXldO1xuXHRcdH1cblxuXHRcdGlmIChMLkJyb3dzZXIucmV0aW5hICYmIG5hbWUgPT09ICdpY29uJykge1xuXHRcdFx0bmFtZSArPSAnLTJ4Jztcblx0XHR9XG5cblx0XHR2YXIgcGF0aCA9IEwuSWNvbi5EZWZhdWx0LmltYWdlUGF0aDtcblxuXHRcdGlmICghcGF0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGF1dG9kZXRlY3QgTC5JY29uLkRlZmF1bHQuaW1hZ2VQYXRoLCBzZXQgaXQgbWFudWFsbHkuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhdGggKyAnL21hcmtlci0nICsgbmFtZSArICcucG5nJztcblx0fVxufSk7XG5cbkwuSWNvbi5EZWZhdWx0LmltYWdlUGF0aCA9IChmdW5jdGlvbiAoKSB7XG5cdHZhciBzY3JpcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpLFxuXHQgICAgbGVhZmxldFJlID0gL1tcXC9eXWxlYWZsZXRbXFwtXFwuX10/KFtcXHdcXC1cXC5fXSopXFwuanNcXD8/LztcblxuXHR2YXIgaSwgbGVuLCBzcmMsIG1hdGNoZXMsIHBhdGg7XG5cblx0Zm9yIChpID0gMCwgbGVuID0gc2NyaXB0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdHNyYyA9IHNjcmlwdHNbaV0uc3JjO1xuXHRcdG1hdGNoZXMgPSBzcmMubWF0Y2gobGVhZmxldFJlKTtcblxuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRwYXRoID0gc3JjLnNwbGl0KGxlYWZsZXRSZSlbMF07XG5cdFx0XHRyZXR1cm4gKHBhdGggPyBwYXRoICsgJy8nIDogJycpICsgJ2ltYWdlcyc7XG5cdFx0fVxuXHR9XG59KCkpO1xuXG5cbi8qXHJcbiAqIEwuTWFya2VyIGlzIHVzZWQgdG8gZGlzcGxheSBjbGlja2FibGUvZHJhZ2dhYmxlIGljb25zIG9uIHRoZSBtYXAuXHJcbiAqL1xyXG5cclxuTC5NYXJrZXIgPSBMLkNsYXNzLmV4dGVuZCh7XHJcblxyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0aWNvbjogbmV3IEwuSWNvbi5EZWZhdWx0KCksXHJcblx0XHR0aXRsZTogJycsXHJcblx0XHRhbHQ6ICcnLFxyXG5cdFx0Y2xpY2thYmxlOiB0cnVlLFxyXG5cdFx0ZHJhZ2dhYmxlOiBmYWxzZSxcclxuXHRcdGtleWJvYXJkOiB0cnVlLFxyXG5cdFx0ekluZGV4T2Zmc2V0OiAwLFxyXG5cdFx0b3BhY2l0eTogMSxcclxuXHRcdHJpc2VPbkhvdmVyOiBmYWxzZSxcclxuXHRcdHJpc2VPZmZzZXQ6IDI1MFxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRsbmcsIG9wdGlvbnMpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHRcdHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHRoaXMuX21hcCA9IG1hcDtcclxuXHJcblx0XHRtYXAub24oJ3ZpZXdyZXNldCcsIHRoaXMudXBkYXRlLCB0aGlzKTtcclxuXHJcblx0XHR0aGlzLl9pbml0SWNvbigpO1xyXG5cdFx0dGhpcy51cGRhdGUoKTtcclxuXHRcdHRoaXMuZmlyZSgnYWRkJyk7XHJcblxyXG5cdFx0aWYgKG1hcC5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgbWFwLm9wdGlvbnMubWFya2VyWm9vbUFuaW1hdGlvbikge1xyXG5cdFx0XHRtYXAub24oJ3pvb21hbmltJywgdGhpcy5fYW5pbWF0ZVpvb20sIHRoaXMpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0aWYgKHRoaXMuZHJhZ2dpbmcpIHtcclxuXHRcdFx0dGhpcy5kcmFnZ2luZy5kaXNhYmxlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fcmVtb3ZlSWNvbigpO1xyXG5cdFx0dGhpcy5fcmVtb3ZlU2hhZG93KCk7XHJcblxyXG5cdFx0dGhpcy5maXJlKCdyZW1vdmUnKTtcclxuXHJcblx0XHRtYXAub2ZmKHtcclxuXHRcdFx0J3ZpZXdyZXNldCc6IHRoaXMudXBkYXRlLFxyXG5cdFx0XHQnem9vbWFuaW0nOiB0aGlzLl9hbmltYXRlWm9vbVxyXG5cdFx0fSwgdGhpcyk7XHJcblxyXG5cdFx0dGhpcy5fbWFwID0gbnVsbDtcclxuXHR9LFxyXG5cclxuXHRnZXRMYXRMbmc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9sYXRsbmc7XHJcblx0fSxcclxuXHJcblx0c2V0TGF0TG5nOiBmdW5jdGlvbiAobGF0bG5nKSB7XHJcblx0XHR0aGlzLl9sYXRsbmcgPSBMLmxhdExuZyhsYXRsbmcpO1xyXG5cclxuXHRcdHRoaXMudXBkYXRlKCk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgnbW92ZScsIHsgbGF0bG5nOiB0aGlzLl9sYXRsbmcgfSk7XHJcblx0fSxcclxuXHJcblx0c2V0WkluZGV4T2Zmc2V0OiBmdW5jdGlvbiAob2Zmc2V0KSB7XHJcblx0XHR0aGlzLm9wdGlvbnMuekluZGV4T2Zmc2V0ID0gb2Zmc2V0O1xyXG5cdFx0dGhpcy51cGRhdGUoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRJY29uOiBmdW5jdGlvbiAoaWNvbikge1xyXG5cclxuXHRcdHRoaXMub3B0aW9ucy5pY29uID0gaWNvbjtcclxuXHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX2luaXRJY29uKCk7XHJcblx0XHRcdHRoaXMudXBkYXRlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX3BvcHVwKSB7XHJcblx0XHRcdHRoaXMuYmluZFBvcHVwKHRoaXMuX3BvcHVwKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHR1cGRhdGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9pY29uKSB7XHJcblx0XHRcdHRoaXMuX3NldFBvcyh0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KHRoaXMuX2xhdGxuZykucm91bmQoKSk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRfaW5pdEljb246IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zLFxyXG5cdFx0ICAgIG1hcCA9IHRoaXMuX21hcCxcclxuXHRcdCAgICBhbmltYXRpb24gPSAobWFwLm9wdGlvbnMuem9vbUFuaW1hdGlvbiAmJiBtYXAub3B0aW9ucy5tYXJrZXJab29tQW5pbWF0aW9uKSxcclxuXHRcdCAgICBjbGFzc1RvQWRkID0gYW5pbWF0aW9uID8gJ2xlYWZsZXQtem9vbS1hbmltYXRlZCcgOiAnbGVhZmxldC16b29tLWhpZGUnO1xyXG5cclxuXHRcdHZhciBpY29uID0gb3B0aW9ucy5pY29uLmNyZWF0ZUljb24odGhpcy5faWNvbiksXHJcblx0XHRcdGFkZEljb24gPSBmYWxzZTtcclxuXHJcblx0XHQvLyBpZiB3ZSdyZSBub3QgcmV1c2luZyB0aGUgaWNvbiwgcmVtb3ZlIHRoZSBvbGQgb25lIGFuZCBpbml0IG5ldyBvbmVcclxuXHRcdGlmIChpY29uICE9PSB0aGlzLl9pY29uKSB7XHJcblx0XHRcdGlmICh0aGlzLl9pY29uKSB7XHJcblx0XHRcdFx0dGhpcy5fcmVtb3ZlSWNvbigpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGFkZEljb24gPSB0cnVlO1xyXG5cclxuXHRcdFx0aWYgKG9wdGlvbnMudGl0bGUpIHtcclxuXHRcdFx0XHRpY29uLnRpdGxlID0gb3B0aW9ucy50aXRsZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKG9wdGlvbnMuYWx0KSB7XHJcblx0XHRcdFx0aWNvbi5hbHQgPSBvcHRpb25zLmFsdDtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdEwuRG9tVXRpbC5hZGRDbGFzcyhpY29uLCBjbGFzc1RvQWRkKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5rZXlib2FyZCkge1xyXG5cdFx0XHRpY29uLnRhYkluZGV4ID0gJzAnO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2ljb24gPSBpY29uO1xyXG5cclxuXHRcdHRoaXMuX2luaXRJbnRlcmFjdGlvbigpO1xyXG5cclxuXHRcdGlmIChvcHRpb25zLnJpc2VPbkhvdmVyKSB7XHJcblx0XHRcdEwuRG9tRXZlbnRcclxuXHRcdFx0XHQub24oaWNvbiwgJ21vdXNlb3ZlcicsIHRoaXMuX2JyaW5nVG9Gcm9udCwgdGhpcylcclxuXHRcdFx0XHQub24oaWNvbiwgJ21vdXNlb3V0JywgdGhpcy5fcmVzZXRaSW5kZXgsIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBuZXdTaGFkb3cgPSBvcHRpb25zLmljb24uY3JlYXRlU2hhZG93KHRoaXMuX3NoYWRvdyksXHJcblx0XHRcdGFkZFNoYWRvdyA9IGZhbHNlO1xyXG5cclxuXHRcdGlmIChuZXdTaGFkb3cgIT09IHRoaXMuX3NoYWRvdykge1xyXG5cdFx0XHR0aGlzLl9yZW1vdmVTaGFkb3coKTtcclxuXHRcdFx0YWRkU2hhZG93ID0gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAobmV3U2hhZG93KSB7XHJcblx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyhuZXdTaGFkb3csIGNsYXNzVG9BZGQpO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fc2hhZG93ID0gbmV3U2hhZG93O1xyXG5cclxuXHJcblx0XHRpZiAob3B0aW9ucy5vcGFjaXR5IDwgMSkge1xyXG5cdFx0XHR0aGlzLl91cGRhdGVPcGFjaXR5KCk7XHJcblx0XHR9XHJcblxyXG5cclxuXHRcdHZhciBwYW5lcyA9IHRoaXMuX21hcC5fcGFuZXM7XHJcblxyXG5cdFx0aWYgKGFkZEljb24pIHtcclxuXHRcdFx0cGFuZXMubWFya2VyUGFuZS5hcHBlbmRDaGlsZCh0aGlzLl9pY29uKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAobmV3U2hhZG93ICYmIGFkZFNoYWRvdykge1xyXG5cdFx0XHRwYW5lcy5zaGFkb3dQYW5lLmFwcGVuZENoaWxkKHRoaXMuX3NoYWRvdyk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X3JlbW92ZUljb246IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLm9wdGlvbnMucmlzZU9uSG92ZXIpIHtcclxuXHRcdFx0TC5Eb21FdmVudFxyXG5cdFx0XHQgICAgLm9mZih0aGlzLl9pY29uLCAnbW91c2VvdmVyJywgdGhpcy5fYnJpbmdUb0Zyb250KVxyXG5cdFx0XHQgICAgLm9mZih0aGlzLl9pY29uLCAnbW91c2VvdXQnLCB0aGlzLl9yZXNldFpJbmRleCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fbWFwLl9wYW5lcy5tYXJrZXJQYW5lLnJlbW92ZUNoaWxkKHRoaXMuX2ljb24pO1xyXG5cclxuXHRcdHRoaXMuX2ljb24gPSBudWxsO1xyXG5cdH0sXHJcblxyXG5cdF9yZW1vdmVTaGFkb3c6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9zaGFkb3cpIHtcclxuXHRcdFx0dGhpcy5fbWFwLl9wYW5lcy5zaGFkb3dQYW5lLnJlbW92ZUNoaWxkKHRoaXMuX3NoYWRvdyk7XHJcblx0XHR9XHJcblx0XHR0aGlzLl9zaGFkb3cgPSBudWxsO1xyXG5cdH0sXHJcblxyXG5cdF9zZXRQb3M6IGZ1bmN0aW9uIChwb3MpIHtcclxuXHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9pY29uLCBwb3MpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9zaGFkb3cpIHtcclxuXHRcdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX3NoYWRvdywgcG9zKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl96SW5kZXggPSBwb3MueSArIHRoaXMub3B0aW9ucy56SW5kZXhPZmZzZXQ7XHJcblxyXG5cdFx0dGhpcy5fcmVzZXRaSW5kZXgoKTtcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlWkluZGV4OiBmdW5jdGlvbiAob2Zmc2V0KSB7XHJcblx0XHR0aGlzLl9pY29uLnN0eWxlLnpJbmRleCA9IHRoaXMuX3pJbmRleCArIG9mZnNldDtcclxuXHR9LFxyXG5cclxuXHRfYW5pbWF0ZVpvb206IGZ1bmN0aW9uIChvcHQpIHtcclxuXHRcdHZhciBwb3MgPSB0aGlzLl9tYXAuX2xhdExuZ1RvTmV3TGF5ZXJQb2ludCh0aGlzLl9sYXRsbmcsIG9wdC56b29tLCBvcHQuY2VudGVyKS5yb3VuZCgpO1xyXG5cclxuXHRcdHRoaXMuX3NldFBvcyhwb3MpO1xyXG5cdH0sXHJcblxyXG5cdF9pbml0SW50ZXJhY3Rpb246IGZ1bmN0aW9uICgpIHtcclxuXHJcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5jbGlja2FibGUpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0Ly8gVE9ETyByZWZhY3RvciBpbnRvIHNvbWV0aGluZyBzaGFyZWQgd2l0aCBNYXAvUGF0aC9ldGMuIHRvIERSWSBpdCB1cFxyXG5cclxuXHRcdHZhciBpY29uID0gdGhpcy5faWNvbixcclxuXHRcdCAgICBldmVudHMgPSBbJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZW92ZXInLCAnbW91c2VvdXQnLCAnY29udGV4dG1lbnUnXTtcclxuXHJcblx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MoaWNvbiwgJ2xlYWZsZXQtY2xpY2thYmxlJyk7XHJcblx0XHRMLkRvbUV2ZW50Lm9uKGljb24sICdjbGljaycsIHRoaXMuX29uTW91c2VDbGljaywgdGhpcyk7XHJcblx0XHRMLkRvbUV2ZW50Lm9uKGljb24sICdrZXlwcmVzcycsIHRoaXMuX29uS2V5UHJlc3MsIHRoaXMpO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgZXZlbnRzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdEwuRG9tRXZlbnQub24oaWNvbiwgZXZlbnRzW2ldLCB0aGlzLl9maXJlTW91c2VFdmVudCwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKEwuSGFuZGxlci5NYXJrZXJEcmFnKSB7XHJcblx0XHRcdHRoaXMuZHJhZ2dpbmcgPSBuZXcgTC5IYW5kbGVyLk1hcmtlckRyYWcodGhpcyk7XHJcblxyXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmRyYWdnYWJsZSkge1xyXG5cdFx0XHRcdHRoaXMuZHJhZ2dpbmcuZW5hYmxlKCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfb25Nb3VzZUNsaWNrOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0dmFyIHdhc0RyYWdnZWQgPSB0aGlzLmRyYWdnaW5nICYmIHRoaXMuZHJhZ2dpbmcubW92ZWQoKTtcclxuXHJcblx0XHRpZiAodGhpcy5oYXNFdmVudExpc3RlbmVycyhlLnR5cGUpIHx8IHdhc0RyYWdnZWQpIHtcclxuXHRcdFx0TC5Eb21FdmVudC5zdG9wUHJvcGFnYXRpb24oZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHdhc0RyYWdnZWQpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0aWYgKCghdGhpcy5kcmFnZ2luZyB8fCAhdGhpcy5kcmFnZ2luZy5fZW5hYmxlZCkgJiYgdGhpcy5fbWFwLmRyYWdnaW5nICYmIHRoaXMuX21hcC5kcmFnZ2luZy5tb3ZlZCgpKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHRoaXMuZmlyZShlLnR5cGUsIHtcclxuXHRcdFx0b3JpZ2luYWxFdmVudDogZSxcclxuXHRcdFx0bGF0bG5nOiB0aGlzLl9sYXRsbmdcclxuXHRcdH0pO1xyXG5cdH0sXHJcblxyXG5cdF9vbktleVByZXNzOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0aWYgKGUua2V5Q29kZSA9PT0gMTMpIHtcclxuXHRcdFx0dGhpcy5maXJlKCdjbGljaycsIHtcclxuXHRcdFx0XHRvcmlnaW5hbEV2ZW50OiBlLFxyXG5cdFx0XHRcdGxhdGxuZzogdGhpcy5fbGF0bG5nXHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9maXJlTW91c2VFdmVudDogZnVuY3Rpb24gKGUpIHtcclxuXHJcblx0XHR0aGlzLmZpcmUoZS50eXBlLCB7XHJcblx0XHRcdG9yaWdpbmFsRXZlbnQ6IGUsXHJcblx0XHRcdGxhdGxuZzogdGhpcy5fbGF0bG5nXHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyBUT0RPIHByb3BlciBjdXN0b20gZXZlbnQgcHJvcGFnYXRpb25cclxuXHRcdC8vIHRoaXMgbGluZSB3aWxsIGFsd2F5cyBiZSBjYWxsZWQgaWYgbWFya2VyIGlzIGluIGEgRmVhdHVyZUdyb3VwXHJcblx0XHRpZiAoZS50eXBlID09PSAnY29udGV4dG1lbnUnICYmIHRoaXMuaGFzRXZlbnRMaXN0ZW5lcnMoZS50eXBlKSkge1xyXG5cdFx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGUudHlwZSAhPT0gJ21vdXNlZG93bicpIHtcclxuXHRcdFx0TC5Eb21FdmVudC5zdG9wUHJvcGFnYXRpb24oZSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHNldE9wYWNpdHk6IGZ1bmN0aW9uIChvcGFjaXR5KSB7XHJcblx0XHR0aGlzLm9wdGlvbnMub3BhY2l0eSA9IG9wYWNpdHk7XHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZU9wYWNpdHkoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlT3BhY2l0eTogZnVuY3Rpb24gKCkge1xyXG5cdFx0TC5Eb21VdGlsLnNldE9wYWNpdHkodGhpcy5faWNvbiwgdGhpcy5vcHRpb25zLm9wYWNpdHkpO1xyXG5cdFx0aWYgKHRoaXMuX3NoYWRvdykge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aGlzLl9zaGFkb3csIHRoaXMub3B0aW9ucy5vcGFjaXR5KTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfYnJpbmdUb0Zyb250OiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl91cGRhdGVaSW5kZXgodGhpcy5vcHRpb25zLnJpc2VPZmZzZXQpO1xyXG5cdH0sXHJcblxyXG5cdF9yZXNldFpJbmRleDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fdXBkYXRlWkluZGV4KDApO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLm1hcmtlciA9IGZ1bmN0aW9uIChsYXRsbmcsIG9wdGlvbnMpIHtcclxuXHRyZXR1cm4gbmV3IEwuTWFya2VyKGxhdGxuZywgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxuICogTC5EaXZJY29uIGlzIGEgbGlnaHR3ZWlnaHQgSFRNTC1iYXNlZCBpY29uIGNsYXNzIChhcyBvcHBvc2VkIHRvIHRoZSBpbWFnZS1iYXNlZCBMLkljb24pXG4gKiB0byB1c2Ugd2l0aCBMLk1hcmtlci5cbiAqL1xuXG5MLkRpdkljb24gPSBMLkljb24uZXh0ZW5kKHtcblx0b3B0aW9uczoge1xuXHRcdGljb25TaXplOiBbMTIsIDEyXSwgLy8gYWxzbyBjYW4gYmUgc2V0IHRocm91Z2ggQ1NTXG5cdFx0Lypcblx0XHRpY29uQW5jaG9yOiAoUG9pbnQpXG5cdFx0cG9wdXBBbmNob3I6IChQb2ludClcblx0XHRodG1sOiAoU3RyaW5nKVxuXHRcdGJnUG9zOiAoUG9pbnQpXG5cdFx0Ki9cblx0XHRjbGFzc05hbWU6ICdsZWFmbGV0LWRpdi1pY29uJyxcblx0XHRodG1sOiBmYWxzZVxuXHR9LFxuXG5cdGNyZWF0ZUljb246IGZ1bmN0aW9uIChvbGRJY29uKSB7XG5cdFx0dmFyIGRpdiA9IChvbGRJY29uICYmIG9sZEljb24udGFnTmFtZSA9PT0gJ0RJVicpID8gb2xkSWNvbiA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdCAgICBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXG5cdFx0aWYgKG9wdGlvbnMuaHRtbCAhPT0gZmFsc2UpIHtcblx0XHRcdGRpdi5pbm5lckhUTUwgPSBvcHRpb25zLmh0bWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpdi5pbm5lckhUTUwgPSAnJztcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5iZ1Bvcykge1xuXHRcdFx0ZGl2LnN0eWxlLmJhY2tncm91bmRQb3NpdGlvbiA9XG5cdFx0XHQgICAgICAgICgtb3B0aW9ucy5iZ1Bvcy54KSArICdweCAnICsgKC1vcHRpb25zLmJnUG9zLnkpICsgJ3B4Jztcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRJY29uU3R5bGVzKGRpdiwgJ2ljb24nKTtcblx0XHRyZXR1cm4gZGl2O1xuXHR9LFxuXG5cdGNyZWF0ZVNoYWRvdzogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG59KTtcblxuTC5kaXZJY29uID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcblx0cmV0dXJuIG5ldyBMLkRpdkljb24ob3B0aW9ucyk7XG59O1xuXG5cbi8qXHJcbiAqIEwuUG9wdXAgaXMgdXNlZCBmb3IgZGlzcGxheWluZyBwb3B1cHMgb24gdGhlIG1hcC5cclxuICovXHJcblxyXG5MLk1hcC5tZXJnZU9wdGlvbnMoe1xyXG5cdGNsb3NlUG9wdXBPbkNsaWNrOiB0cnVlXHJcbn0pO1xyXG5cclxuTC5Qb3B1cCA9IEwuQ2xhc3MuZXh0ZW5kKHtcclxuXHRpbmNsdWRlczogTC5NaXhpbi5FdmVudHMsXHJcblxyXG5cdG9wdGlvbnM6IHtcclxuXHRcdG1pbldpZHRoOiA1MCxcclxuXHRcdG1heFdpZHRoOiAzMDAsXHJcblx0XHQvLyBtYXhIZWlnaHQ6IG51bGwsXHJcblx0XHRhdXRvUGFuOiB0cnVlLFxyXG5cdFx0Y2xvc2VCdXR0b246IHRydWUsXHJcblx0XHRvZmZzZXQ6IFswLCA3XSxcclxuXHRcdGF1dG9QYW5QYWRkaW5nOiBbNSwgNV0sXHJcblx0XHQvLyBhdXRvUGFuUGFkZGluZ1RvcExlZnQ6IG51bGwsXHJcblx0XHQvLyBhdXRvUGFuUGFkZGluZ0JvdHRvbVJpZ2h0OiBudWxsLFxyXG5cdFx0a2VlcEluVmlldzogZmFsc2UsXHJcblx0XHRjbGFzc05hbWU6ICcnLFxyXG5cdFx0em9vbUFuaW1hdGlvbjogdHJ1ZVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zLCBzb3VyY2UpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHJcblx0XHR0aGlzLl9zb3VyY2UgPSBzb3VyY2U7XHJcblx0XHR0aGlzLl9hbmltYXRlZCA9IEwuQnJvd3Nlci5hbnkzZCAmJiB0aGlzLm9wdGlvbnMuem9vbUFuaW1hdGlvbjtcclxuXHRcdHRoaXMuX2lzT3BlbiA9IGZhbHNlO1xyXG5cdH0sXHJcblxyXG5cdG9uQWRkOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLl9tYXAgPSBtYXA7XHJcblxyXG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0dGhpcy5faW5pdExheW91dCgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBhbmltRmFkZSA9IG1hcC5vcHRpb25zLmZhZGVBbmltYXRpb247XHJcblxyXG5cdFx0aWYgKGFuaW1GYWRlKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5zZXRPcGFjaXR5KHRoaXMuX2NvbnRhaW5lciwgMCk7XHJcblx0XHR9XHJcblx0XHRtYXAuX3BhbmVzLnBvcHVwUGFuZS5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cclxuXHRcdG1hcC5vbih0aGlzLl9nZXRFdmVudHMoKSwgdGhpcyk7XHJcblxyXG5cdFx0dGhpcy51cGRhdGUoKTtcclxuXHJcblx0XHRpZiAoYW5pbUZhZGUpIHtcclxuXHRcdFx0TC5Eb21VdGlsLnNldE9wYWNpdHkodGhpcy5fY29udGFpbmVyLCAxKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLmZpcmUoJ29wZW4nKTtcclxuXHJcblx0XHRtYXAuZmlyZSgncG9wdXBvcGVuJywge3BvcHVwOiB0aGlzfSk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX3NvdXJjZSkge1xyXG5cdFx0XHR0aGlzLl9zb3VyY2UuZmlyZSgncG9wdXBvcGVuJywge3BvcHVwOiB0aGlzfSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0YWRkVG86IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdG1hcC5hZGRMYXllcih0aGlzKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdG9wZW5PbjogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0bWFwLm9wZW5Qb3B1cCh0aGlzKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuX3BhbmVzLnBvcHVwUGFuZS5yZW1vdmVDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cclxuXHRcdEwuVXRpbC5mYWxzZUZuKHRoaXMuX2NvbnRhaW5lci5vZmZzZXRXaWR0aCk7IC8vIGZvcmNlIHJlZmxvd1xyXG5cclxuXHRcdG1hcC5vZmYodGhpcy5fZ2V0RXZlbnRzKCksIHRoaXMpO1xyXG5cclxuXHRcdGlmIChtYXAub3B0aW9ucy5mYWRlQW5pbWF0aW9uKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5zZXRPcGFjaXR5KHRoaXMuX2NvbnRhaW5lciwgMCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fbWFwID0gbnVsbDtcclxuXHJcblx0XHR0aGlzLmZpcmUoJ2Nsb3NlJyk7XHJcblxyXG5cdFx0bWFwLmZpcmUoJ3BvcHVwY2xvc2UnLCB7cG9wdXA6IHRoaXN9KTtcclxuXHJcblx0XHRpZiAodGhpcy5fc291cmNlKSB7XHJcblx0XHRcdHRoaXMuX3NvdXJjZS5maXJlKCdwb3B1cGNsb3NlJywge3BvcHVwOiB0aGlzfSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0Z2V0TGF0TG5nOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbGF0bG5nO1xyXG5cdH0sXHJcblxyXG5cdHNldExhdExuZzogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0dGhpcy5fbGF0bG5nID0gTC5sYXRMbmcobGF0bG5nKTtcclxuXHRcdGlmICh0aGlzLl9tYXApIHtcclxuXHRcdFx0dGhpcy5fdXBkYXRlUG9zaXRpb24oKTtcclxuXHRcdFx0dGhpcy5fYWRqdXN0UGFuKCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRnZXRDb250ZW50OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudDtcclxuXHR9LFxyXG5cclxuXHRzZXRDb250ZW50OiBmdW5jdGlvbiAoY29udGVudCkge1xyXG5cdFx0dGhpcy5fY29udGVudCA9IGNvbnRlbnQ7XHJcblx0XHR0aGlzLnVwZGF0ZSgpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0dXBkYXRlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAoIXRoaXMuX21hcCkgeyByZXR1cm47IH1cclxuXHJcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xyXG5cclxuXHRcdHRoaXMuX3VwZGF0ZUNvbnRlbnQoKTtcclxuXHRcdHRoaXMuX3VwZGF0ZUxheW91dCgpO1xyXG5cdFx0dGhpcy5fdXBkYXRlUG9zaXRpb24oKTtcclxuXHJcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUudmlzaWJpbGl0eSA9ICcnO1xyXG5cclxuXHRcdHRoaXMuX2FkanVzdFBhbigpO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRFdmVudHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBldmVudHMgPSB7XHJcblx0XHRcdHZpZXdyZXNldDogdGhpcy5fdXBkYXRlUG9zaXRpb25cclxuXHRcdH07XHJcblxyXG5cdFx0aWYgKHRoaXMuX2FuaW1hdGVkKSB7XHJcblx0XHRcdGV2ZW50cy56b29tYW5pbSA9IHRoaXMuX3pvb21BbmltYXRpb247XHJcblx0XHR9XHJcblx0XHRpZiAoJ2Nsb3NlT25DbGljaycgaW4gdGhpcy5vcHRpb25zID8gdGhpcy5vcHRpb25zLmNsb3NlT25DbGljayA6IHRoaXMuX21hcC5vcHRpb25zLmNsb3NlUG9wdXBPbkNsaWNrKSB7XHJcblx0XHRcdGV2ZW50cy5wcmVjbGljayA9IHRoaXMuX2Nsb3NlO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5rZWVwSW5WaWV3KSB7XHJcblx0XHRcdGV2ZW50cy5tb3ZlZW5kID0gdGhpcy5fYWRqdXN0UGFuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBldmVudHM7XHJcblx0fSxcclxuXHJcblx0X2Nsb3NlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX21hcC5jbG9zZVBvcHVwKHRoaXMpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9pbml0TGF5b3V0OiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgcHJlZml4ID0gJ2xlYWZsZXQtcG9wdXAnLFxyXG5cdFx0XHRjb250YWluZXJDbGFzcyA9IHByZWZpeCArICcgJyArIHRoaXMub3B0aW9ucy5jbGFzc05hbWUgKyAnIGxlYWZsZXQtem9vbS0nICtcclxuXHRcdFx0ICAgICAgICAodGhpcy5fYW5pbWF0ZWQgPyAnYW5pbWF0ZWQnIDogJ2hpZGUnKSxcclxuXHRcdFx0Y29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY29udGFpbmVyQ2xhc3MpLFxyXG5cdFx0XHRjbG9zZUJ1dHRvbjtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLmNsb3NlQnV0dG9uKSB7XHJcblx0XHRcdGNsb3NlQnV0dG9uID0gdGhpcy5fY2xvc2VCdXR0b24gPVxyXG5cdFx0XHQgICAgICAgIEwuRG9tVXRpbC5jcmVhdGUoJ2EnLCBwcmVmaXggKyAnLWNsb3NlLWJ1dHRvbicsIGNvbnRhaW5lcik7XHJcblx0XHRcdGNsb3NlQnV0dG9uLmhyZWYgPSAnI2Nsb3NlJztcclxuXHRcdFx0Y2xvc2VCdXR0b24uaW5uZXJIVE1MID0gJyYjMjE1Oyc7XHJcblx0XHRcdEwuRG9tRXZlbnQuZGlzYWJsZUNsaWNrUHJvcGFnYXRpb24oY2xvc2VCdXR0b24pO1xyXG5cclxuXHRcdFx0TC5Eb21FdmVudC5vbihjbG9zZUJ1dHRvbiwgJ2NsaWNrJywgdGhpcy5fb25DbG9zZUJ1dHRvbkNsaWNrLCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgd3JhcHBlciA9IHRoaXMuX3dyYXBwZXIgPVxyXG5cdFx0ICAgICAgICBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCBwcmVmaXggKyAnLWNvbnRlbnQtd3JhcHBlcicsIGNvbnRhaW5lcik7XHJcblx0XHRMLkRvbUV2ZW50LmRpc2FibGVDbGlja1Byb3BhZ2F0aW9uKHdyYXBwZXIpO1xyXG5cclxuXHRcdHRoaXMuX2NvbnRlbnROb2RlID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgcHJlZml4ICsgJy1jb250ZW50Jywgd3JhcHBlcik7XHJcblxyXG5cdFx0TC5Eb21FdmVudC5kaXNhYmxlU2Nyb2xsUHJvcGFnYXRpb24odGhpcy5fY29udGVudE5vZGUpO1xyXG5cdFx0TC5Eb21FdmVudC5vbih3cmFwcGVyLCAnY29udGV4dG1lbnUnLCBMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbik7XHJcblxyXG5cdFx0dGhpcy5fdGlwQ29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgcHJlZml4ICsgJy10aXAtY29udGFpbmVyJywgY29udGFpbmVyKTtcclxuXHRcdHRoaXMuX3RpcCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIHByZWZpeCArICctdGlwJywgdGhpcy5fdGlwQ29udGFpbmVyKTtcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlQ29udGVudDogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9jb250ZW50KSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGlmICh0eXBlb2YgdGhpcy5fY29udGVudCA9PT0gJ3N0cmluZycpIHtcclxuXHRcdFx0dGhpcy5fY29udGVudE5vZGUuaW5uZXJIVE1MID0gdGhpcy5fY29udGVudDtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHdoaWxlICh0aGlzLl9jb250ZW50Tm9kZS5oYXNDaGlsZE5vZGVzKCkpIHtcclxuXHRcdFx0XHR0aGlzLl9jb250ZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLl9jb250ZW50Tm9kZS5maXJzdENoaWxkKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLl9jb250ZW50Tm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9jb250ZW50KTtcclxuXHRcdH1cclxuXHRcdHRoaXMuZmlyZSgnY29udGVudHVwZGF0ZScpO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVMYXlvdXQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjb250YWluZXIgPSB0aGlzLl9jb250ZW50Tm9kZSxcclxuXHRcdCAgICBzdHlsZSA9IGNvbnRhaW5lci5zdHlsZTtcclxuXHJcblx0XHRzdHlsZS53aWR0aCA9ICcnO1xyXG5cdFx0c3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xyXG5cclxuXHRcdHZhciB3aWR0aCA9IGNvbnRhaW5lci5vZmZzZXRXaWR0aDtcclxuXHRcdHdpZHRoID0gTWF0aC5taW4od2lkdGgsIHRoaXMub3B0aW9ucy5tYXhXaWR0aCk7XHJcblx0XHR3aWR0aCA9IE1hdGgubWF4KHdpZHRoLCB0aGlzLm9wdGlvbnMubWluV2lkdGgpO1xyXG5cclxuXHRcdHN0eWxlLndpZHRoID0gKHdpZHRoICsgMSkgKyAncHgnO1xyXG5cdFx0c3R5bGUud2hpdGVTcGFjZSA9ICcnO1xyXG5cclxuXHRcdHN0eWxlLmhlaWdodCA9ICcnO1xyXG5cclxuXHRcdHZhciBoZWlnaHQgPSBjb250YWluZXIub2Zmc2V0SGVpZ2h0LFxyXG5cdFx0ICAgIG1heEhlaWdodCA9IHRoaXMub3B0aW9ucy5tYXhIZWlnaHQsXHJcblx0XHQgICAgc2Nyb2xsZWRDbGFzcyA9ICdsZWFmbGV0LXBvcHVwLXNjcm9sbGVkJztcclxuXHJcblx0XHRpZiAobWF4SGVpZ2h0ICYmIGhlaWdodCA+IG1heEhlaWdodCkge1xyXG5cdFx0XHRzdHlsZS5oZWlnaHQgPSBtYXhIZWlnaHQgKyAncHgnO1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MoY29udGFpbmVyLCBzY3JvbGxlZENsYXNzKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyhjb250YWluZXIsIHNjcm9sbGVkQ2xhc3MpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NvbnRhaW5lcldpZHRoID0gdGhpcy5fY29udGFpbmVyLm9mZnNldFdpZHRoO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVQb3NpdGlvbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIHBvcyA9IHRoaXMuX21hcC5sYXRMbmdUb0xheWVyUG9pbnQodGhpcy5fbGF0bG5nKSxcclxuXHRcdCAgICBhbmltYXRlZCA9IHRoaXMuX2FuaW1hdGVkLFxyXG5cdFx0ICAgIG9mZnNldCA9IEwucG9pbnQodGhpcy5vcHRpb25zLm9mZnNldCk7XHJcblxyXG5cdFx0aWYgKGFuaW1hdGVkKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9jb250YWluZXIsIHBvcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fY29udGFpbmVyQm90dG9tID0gLW9mZnNldC55IC0gKGFuaW1hdGVkID8gMCA6IHBvcy55KTtcclxuXHRcdHRoaXMuX2NvbnRhaW5lckxlZnQgPSAtTWF0aC5yb3VuZCh0aGlzLl9jb250YWluZXJXaWR0aCAvIDIpICsgb2Zmc2V0LnggKyAoYW5pbWF0ZWQgPyAwIDogcG9zLngpO1xyXG5cclxuXHRcdC8vIGJvdHRvbSBwb3NpdGlvbiB0aGUgcG9wdXAgaW4gY2FzZSB0aGUgaGVpZ2h0IG9mIHRoZSBwb3B1cCBjaGFuZ2VzIChpbWFnZXMgbG9hZGluZyBldGMpXHJcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuYm90dG9tID0gdGhpcy5fY29udGFpbmVyQm90dG9tICsgJ3B4JztcclxuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5sZWZ0ID0gdGhpcy5fY29udGFpbmVyTGVmdCArICdweCc7XHJcblx0fSxcclxuXHJcblx0X3pvb21BbmltYXRpb246IGZ1bmN0aW9uIChvcHQpIHtcclxuXHRcdHZhciBwb3MgPSB0aGlzLl9tYXAuX2xhdExuZ1RvTmV3TGF5ZXJQb2ludCh0aGlzLl9sYXRsbmcsIG9wdC56b29tLCBvcHQuY2VudGVyKTtcclxuXHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24odGhpcy5fY29udGFpbmVyLCBwb3MpO1xyXG5cdH0sXHJcblxyXG5cdF9hZGp1c3RQYW46IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICghdGhpcy5vcHRpb25zLmF1dG9QYW4pIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcclxuXHRcdCAgICBjb250YWluZXJIZWlnaHQgPSB0aGlzLl9jb250YWluZXIub2Zmc2V0SGVpZ2h0LFxyXG5cdFx0ICAgIGNvbnRhaW5lcldpZHRoID0gdGhpcy5fY29udGFpbmVyV2lkdGgsXHJcblxyXG5cdFx0ICAgIGxheWVyUG9zID0gbmV3IEwuUG9pbnQodGhpcy5fY29udGFpbmVyTGVmdCwgLWNvbnRhaW5lckhlaWdodCAtIHRoaXMuX2NvbnRhaW5lckJvdHRvbSk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX2FuaW1hdGVkKSB7XHJcblx0XHRcdGxheWVyUG9zLl9hZGQoTC5Eb21VdGlsLmdldFBvc2l0aW9uKHRoaXMuX2NvbnRhaW5lcikpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBjb250YWluZXJQb3MgPSBtYXAubGF5ZXJQb2ludFRvQ29udGFpbmVyUG9pbnQobGF5ZXJQb3MpLFxyXG5cdFx0ICAgIHBhZGRpbmcgPSBMLnBvaW50KHRoaXMub3B0aW9ucy5hdXRvUGFuUGFkZGluZyksXHJcblx0XHQgICAgcGFkZGluZ1RMID0gTC5wb2ludCh0aGlzLm9wdGlvbnMuYXV0b1BhblBhZGRpbmdUb3BMZWZ0IHx8IHBhZGRpbmcpLFxyXG5cdFx0ICAgIHBhZGRpbmdCUiA9IEwucG9pbnQodGhpcy5vcHRpb25zLmF1dG9QYW5QYWRkaW5nQm90dG9tUmlnaHQgfHwgcGFkZGluZyksXHJcblx0XHQgICAgc2l6ZSA9IG1hcC5nZXRTaXplKCksXHJcblx0XHQgICAgZHggPSAwLFxyXG5cdFx0ICAgIGR5ID0gMDtcclxuXHJcblx0XHRpZiAoY29udGFpbmVyUG9zLnggKyBjb250YWluZXJXaWR0aCArIHBhZGRpbmdCUi54ID4gc2l6ZS54KSB7IC8vIHJpZ2h0XHJcblx0XHRcdGR4ID0gY29udGFpbmVyUG9zLnggKyBjb250YWluZXJXaWR0aCAtIHNpemUueCArIHBhZGRpbmdCUi54O1xyXG5cdFx0fVxyXG5cdFx0aWYgKGNvbnRhaW5lclBvcy54IC0gZHggLSBwYWRkaW5nVEwueCA8IDApIHsgLy8gbGVmdFxyXG5cdFx0XHRkeCA9IGNvbnRhaW5lclBvcy54IC0gcGFkZGluZ1RMLng7XHJcblx0XHR9XHJcblx0XHRpZiAoY29udGFpbmVyUG9zLnkgKyBjb250YWluZXJIZWlnaHQgKyBwYWRkaW5nQlIueSA+IHNpemUueSkgeyAvLyBib3R0b21cclxuXHRcdFx0ZHkgPSBjb250YWluZXJQb3MueSArIGNvbnRhaW5lckhlaWdodCAtIHNpemUueSArIHBhZGRpbmdCUi55O1xyXG5cdFx0fVxyXG5cdFx0aWYgKGNvbnRhaW5lclBvcy55IC0gZHkgLSBwYWRkaW5nVEwueSA8IDApIHsgLy8gdG9wXHJcblx0XHRcdGR5ID0gY29udGFpbmVyUG9zLnkgLSBwYWRkaW5nVEwueTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoZHggfHwgZHkpIHtcclxuXHRcdFx0bWFwXHJcblx0XHRcdCAgICAuZmlyZSgnYXV0b3BhbnN0YXJ0JylcclxuXHRcdFx0ICAgIC5wYW5CeShbZHgsIGR5XSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X29uQ2xvc2VCdXR0b25DbGljazogZnVuY3Rpb24gKGUpIHtcclxuXHRcdHRoaXMuX2Nsb3NlKCk7XHJcblx0XHRMLkRvbUV2ZW50LnN0b3AoZSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwucG9wdXAgPSBmdW5jdGlvbiAob3B0aW9ucywgc291cmNlKSB7XHJcblx0cmV0dXJuIG5ldyBMLlBvcHVwKG9wdGlvbnMsIHNvdXJjZSk7XHJcbn07XHJcblxyXG5cclxuTC5NYXAuaW5jbHVkZSh7XHJcblx0b3BlblBvcHVwOiBmdW5jdGlvbiAocG9wdXAsIGxhdGxuZywgb3B0aW9ucykgeyAvLyAoUG9wdXApIG9yIChTdHJpbmcgfHwgSFRNTEVsZW1lbnQsIExhdExuZ1ssIE9iamVjdF0pXHJcblx0XHR0aGlzLmNsb3NlUG9wdXAoKTtcclxuXHJcblx0XHRpZiAoIShwb3B1cCBpbnN0YW5jZW9mIEwuUG9wdXApKSB7XHJcblx0XHRcdHZhciBjb250ZW50ID0gcG9wdXA7XHJcblxyXG5cdFx0XHRwb3B1cCA9IG5ldyBMLlBvcHVwKG9wdGlvbnMpXHJcblx0XHRcdCAgICAuc2V0TGF0TG5nKGxhdGxuZylcclxuXHRcdFx0ICAgIC5zZXRDb250ZW50KGNvbnRlbnQpO1xyXG5cdFx0fVxyXG5cdFx0cG9wdXAuX2lzT3BlbiA9IHRydWU7XHJcblxyXG5cdFx0dGhpcy5fcG9wdXAgPSBwb3B1cDtcclxuXHRcdHJldHVybiB0aGlzLmFkZExheWVyKHBvcHVwKTtcclxuXHR9LFxyXG5cclxuXHRjbG9zZVBvcHVwOiBmdW5jdGlvbiAocG9wdXApIHtcclxuXHRcdGlmICghcG9wdXAgfHwgcG9wdXAgPT09IHRoaXMuX3BvcHVwKSB7XHJcblx0XHRcdHBvcHVwID0gdGhpcy5fcG9wdXA7XHJcblx0XHRcdHRoaXMuX3BvcHVwID0gbnVsbDtcclxuXHRcdH1cclxuXHRcdGlmIChwb3B1cCkge1xyXG5cdFx0XHR0aGlzLnJlbW92ZUxheWVyKHBvcHVwKTtcclxuXHRcdFx0cG9wdXAuX2lzT3BlbiA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIFBvcHVwIGV4dGVuc2lvbiB0byBMLk1hcmtlciwgYWRkaW5nIHBvcHVwLXJlbGF0ZWQgbWV0aG9kcy5cclxuICovXHJcblxyXG5MLk1hcmtlci5pbmNsdWRlKHtcclxuXHRvcGVuUG9wdXA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9wb3B1cCAmJiB0aGlzLl9tYXAgJiYgIXRoaXMuX21hcC5oYXNMYXllcih0aGlzLl9wb3B1cCkpIHtcclxuXHRcdFx0dGhpcy5fcG9wdXAuc2V0TGF0TG5nKHRoaXMuX2xhdGxuZyk7XHJcblx0XHRcdHRoaXMuX21hcC5vcGVuUG9wdXAodGhpcy5fcG9wdXApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGNsb3NlUG9wdXA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9wb3B1cCkge1xyXG5cdFx0XHR0aGlzLl9wb3B1cC5fY2xvc2UoKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHRvZ2dsZVBvcHVwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fcG9wdXApIHtcclxuXHRcdFx0aWYgKHRoaXMuX3BvcHVwLl9pc09wZW4pIHtcclxuXHRcdFx0XHR0aGlzLmNsb3NlUG9wdXAoKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLm9wZW5Qb3B1cCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRiaW5kUG9wdXA6IGZ1bmN0aW9uIChjb250ZW50LCBvcHRpb25zKSB7XHJcblx0XHR2YXIgYW5jaG9yID0gTC5wb2ludCh0aGlzLm9wdGlvbnMuaWNvbi5vcHRpb25zLnBvcHVwQW5jaG9yIHx8IFswLCAwXSk7XHJcblxyXG5cdFx0YW5jaG9yID0gYW5jaG9yLmFkZChMLlBvcHVwLnByb3RvdHlwZS5vcHRpb25zLm9mZnNldCk7XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5vZmZzZXQpIHtcclxuXHRcdFx0YW5jaG9yID0gYW5jaG9yLmFkZChvcHRpb25zLm9mZnNldCk7XHJcblx0XHR9XHJcblxyXG5cdFx0b3B0aW9ucyA9IEwuZXh0ZW5kKHtvZmZzZXQ6IGFuY2hvcn0sIG9wdGlvbnMpO1xyXG5cclxuXHRcdGlmICghdGhpcy5fcG9wdXBIYW5kbGVyc0FkZGVkKSB7XHJcblx0XHRcdHRoaXNcclxuXHRcdFx0ICAgIC5vbignY2xpY2snLCB0aGlzLnRvZ2dsZVBvcHVwLCB0aGlzKVxyXG5cdFx0XHQgICAgLm9uKCdyZW1vdmUnLCB0aGlzLmNsb3NlUG9wdXAsIHRoaXMpXHJcblx0XHRcdCAgICAub24oJ21vdmUnLCB0aGlzLl9tb3ZlUG9wdXAsIHRoaXMpO1xyXG5cdFx0XHR0aGlzLl9wb3B1cEhhbmRsZXJzQWRkZWQgPSB0cnVlO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChjb250ZW50IGluc3RhbmNlb2YgTC5Qb3B1cCkge1xyXG5cdFx0XHRMLnNldE9wdGlvbnMoY29udGVudCwgb3B0aW9ucyk7XHJcblx0XHRcdHRoaXMuX3BvcHVwID0gY29udGVudDtcclxuXHRcdFx0Y29udGVudC5fc291cmNlID0gdGhpcztcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX3BvcHVwID0gbmV3IEwuUG9wdXAob3B0aW9ucywgdGhpcylcclxuXHRcdFx0XHQuc2V0Q29udGVudChjb250ZW50KTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRQb3B1cENvbnRlbnQ6IGZ1bmN0aW9uIChjb250ZW50KSB7XHJcblx0XHRpZiAodGhpcy5fcG9wdXApIHtcclxuXHRcdFx0dGhpcy5fcG9wdXAuc2V0Q29udGVudChjb250ZW50KTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHVuYmluZFBvcHVwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fcG9wdXApIHtcclxuXHRcdFx0dGhpcy5fcG9wdXAgPSBudWxsO1xyXG5cdFx0XHR0aGlzXHJcblx0XHRcdCAgICAub2ZmKCdjbGljaycsIHRoaXMudG9nZ2xlUG9wdXAsIHRoaXMpXHJcblx0XHRcdCAgICAub2ZmKCdyZW1vdmUnLCB0aGlzLmNsb3NlUG9wdXAsIHRoaXMpXHJcblx0XHRcdCAgICAub2ZmKCdtb3ZlJywgdGhpcy5fbW92ZVBvcHVwLCB0aGlzKTtcclxuXHRcdFx0dGhpcy5fcG9wdXBIYW5kbGVyc0FkZGVkID0gZmFsc2U7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRnZXRQb3B1cDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3BvcHVwO1xyXG5cdH0sXHJcblxyXG5cdF9tb3ZlUG9wdXA6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR0aGlzLl9wb3B1cC5zZXRMYXRMbmcoZS5sYXRsbmcpO1xyXG5cdH1cclxufSk7XHJcblxuXG4vKlxyXG4gKiBMLkxheWVyR3JvdXAgaXMgYSBjbGFzcyB0byBjb21iaW5lIHNldmVyYWwgbGF5ZXJzIGludG8gb25lIHNvIHRoYXRcclxuICogeW91IGNhbiBtYW5pcHVsYXRlIHRoZSBncm91cCAoZS5nLiBhZGQvcmVtb3ZlIGl0KSBhcyBvbmUgbGF5ZXIuXHJcbiAqL1xyXG5cclxuTC5MYXllckdyb3VwID0gTC5DbGFzcy5leHRlbmQoe1xyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXllcnMpIHtcclxuXHRcdHRoaXMuX2xheWVycyA9IHt9O1xyXG5cclxuXHRcdHZhciBpLCBsZW47XHJcblxyXG5cdFx0aWYgKGxheWVycykge1xyXG5cdFx0XHRmb3IgKGkgPSAwLCBsZW4gPSBsYXllcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0XHR0aGlzLmFkZExheWVyKGxheWVyc1tpXSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRhZGRMYXllcjogZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHR2YXIgaWQgPSB0aGlzLmdldExheWVySWQobGF5ZXIpO1xyXG5cclxuXHRcdHRoaXMuX2xheWVyc1tpZF0gPSBsYXllcjtcclxuXHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX21hcC5hZGRMYXllcihsYXllcik7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIGlkID0gbGF5ZXIgaW4gdGhpcy5fbGF5ZXJzID8gbGF5ZXIgOiB0aGlzLmdldExheWVySWQobGF5ZXIpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9tYXAgJiYgdGhpcy5fbGF5ZXJzW2lkXSkge1xyXG5cdFx0XHR0aGlzLl9tYXAucmVtb3ZlTGF5ZXIodGhpcy5fbGF5ZXJzW2lkXSk7XHJcblx0XHR9XHJcblxyXG5cdFx0ZGVsZXRlIHRoaXMuX2xheWVyc1tpZF07XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0aGFzTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0aWYgKCFsYXllcikgeyByZXR1cm4gZmFsc2U7IH1cclxuXHJcblx0XHRyZXR1cm4gKGxheWVyIGluIHRoaXMuX2xheWVycyB8fCB0aGlzLmdldExheWVySWQobGF5ZXIpIGluIHRoaXMuX2xheWVycyk7XHJcblx0fSxcclxuXHJcblx0Y2xlYXJMYXllcnM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuZWFjaExheWVyKHRoaXMucmVtb3ZlTGF5ZXIsIHRoaXMpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0aW52b2tlOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xyXG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLFxyXG5cdFx0ICAgIGksIGxheWVyO1xyXG5cclxuXHRcdGZvciAoaSBpbiB0aGlzLl9sYXllcnMpIHtcclxuXHRcdFx0bGF5ZXIgPSB0aGlzLl9sYXllcnNbaV07XHJcblxyXG5cdFx0XHRpZiAobGF5ZXJbbWV0aG9kTmFtZV0pIHtcclxuXHRcdFx0XHRsYXllclttZXRob2ROYW1lXS5hcHBseShsYXllciwgYXJncyk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvbkFkZDogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5fbWFwID0gbWFwO1xyXG5cdFx0dGhpcy5lYWNoTGF5ZXIobWFwLmFkZExheWVyLCBtYXApO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLmVhY2hMYXllcihtYXAucmVtb3ZlTGF5ZXIsIG1hcCk7XHJcblx0XHR0aGlzLl9tYXAgPSBudWxsO1xyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRlYWNoTGF5ZXI6IGZ1bmN0aW9uIChtZXRob2QsIGNvbnRleHQpIHtcclxuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5fbGF5ZXJzKSB7XHJcblx0XHRcdG1ldGhvZC5jYWxsKGNvbnRleHQsIHRoaXMuX2xheWVyc1tpXSk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRnZXRMYXllcjogZnVuY3Rpb24gKGlkKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbGF5ZXJzW2lkXTtcclxuXHR9LFxyXG5cclxuXHRnZXRMYXllcnM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBsYXllcnMgPSBbXTtcclxuXHJcblx0XHRmb3IgKHZhciBpIGluIHRoaXMuX2xheWVycykge1xyXG5cdFx0XHRsYXllcnMucHVzaCh0aGlzLl9sYXllcnNbaV0pO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGxheWVycztcclxuXHR9LFxyXG5cclxuXHRzZXRaSW5kZXg6IGZ1bmN0aW9uICh6SW5kZXgpIHtcclxuXHRcdHJldHVybiB0aGlzLmludm9rZSgnc2V0WkluZGV4JywgekluZGV4KTtcclxuXHR9LFxyXG5cclxuXHRnZXRMYXllcklkOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdHJldHVybiBMLnN0YW1wKGxheWVyKTtcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5sYXllckdyb3VwID0gZnVuY3Rpb24gKGxheWVycykge1xyXG5cdHJldHVybiBuZXcgTC5MYXllckdyb3VwKGxheWVycyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLkZlYXR1cmVHcm91cCBleHRlbmRzIEwuTGF5ZXJHcm91cCBieSBpbnRyb2R1Y2luZyBtb3VzZSBldmVudHMgYW5kIGFkZGl0aW9uYWwgbWV0aG9kc1xyXG4gKiBzaGFyZWQgYmV0d2VlbiBhIGdyb3VwIG9mIGludGVyYWN0aXZlIGxheWVycyAobGlrZSB2ZWN0b3JzIG9yIG1hcmtlcnMpLlxyXG4gKi9cclxuXHJcbkwuRmVhdHVyZUdyb3VwID0gTC5MYXllckdyb3VwLmV4dGVuZCh7XHJcblx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxyXG5cclxuXHRzdGF0aWNzOiB7XHJcblx0XHRFVkVOVFM6ICdjbGljayBkYmxjbGljayBtb3VzZW92ZXIgbW91c2VvdXQgbW91c2Vtb3ZlIGNvbnRleHRtZW51IHBvcHVwb3BlbiBwb3B1cGNsb3NlJ1xyXG5cdH0sXHJcblxyXG5cdGFkZExheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdGlmICh0aGlzLmhhc0xheWVyKGxheWVyKSkge1xyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoJ29uJyBpbiBsYXllcikge1xyXG5cdFx0XHRsYXllci5vbihMLkZlYXR1cmVHcm91cC5FVkVOVFMsIHRoaXMuX3Byb3BhZ2F0ZUV2ZW50LCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHRMLkxheWVyR3JvdXAucHJvdG90eXBlLmFkZExheWVyLmNhbGwodGhpcywgbGF5ZXIpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9wb3B1cENvbnRlbnQgJiYgbGF5ZXIuYmluZFBvcHVwKSB7XHJcblx0XHRcdGxheWVyLmJpbmRQb3B1cCh0aGlzLl9wb3B1cENvbnRlbnQsIHRoaXMuX3BvcHVwT3B0aW9ucyk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgnbGF5ZXJhZGQnLCB7bGF5ZXI6IGxheWVyfSk7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0aWYgKCF0aGlzLmhhc0xheWVyKGxheWVyKSkge1xyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdH1cclxuXHRcdGlmIChsYXllciBpbiB0aGlzLl9sYXllcnMpIHtcclxuXHRcdFx0bGF5ZXIgPSB0aGlzLl9sYXllcnNbbGF5ZXJdO1xyXG5cdFx0fVxyXG5cclxuXHRcdGxheWVyLm9mZihMLkZlYXR1cmVHcm91cC5FVkVOVFMsIHRoaXMuX3Byb3BhZ2F0ZUV2ZW50LCB0aGlzKTtcclxuXHJcblx0XHRMLkxheWVyR3JvdXAucHJvdG90eXBlLnJlbW92ZUxheWVyLmNhbGwodGhpcywgbGF5ZXIpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9wb3B1cENvbnRlbnQpIHtcclxuXHRcdFx0dGhpcy5pbnZva2UoJ3VuYmluZFBvcHVwJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgnbGF5ZXJyZW1vdmUnLCB7bGF5ZXI6IGxheWVyfSk7XHJcblx0fSxcclxuXHJcblx0YmluZFBvcHVwOiBmdW5jdGlvbiAoY29udGVudCwgb3B0aW9ucykge1xyXG5cdFx0dGhpcy5fcG9wdXBDb250ZW50ID0gY29udGVudDtcclxuXHRcdHRoaXMuX3BvcHVwT3B0aW9ucyA9IG9wdGlvbnM7XHJcblx0XHRyZXR1cm4gdGhpcy5pbnZva2UoJ2JpbmRQb3B1cCcsIGNvbnRlbnQsIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdG9wZW5Qb3B1cDogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0Ly8gb3BlbiBwb3B1cCBvbiB0aGUgZmlyc3QgbGF5ZXJcclxuXHRcdGZvciAodmFyIGlkIGluIHRoaXMuX2xheWVycykge1xyXG5cdFx0XHR0aGlzLl9sYXllcnNbaWRdLm9wZW5Qb3B1cChsYXRsbmcpO1xyXG5cdFx0XHRicmVhaztcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHNldFN0eWxlOiBmdW5jdGlvbiAoc3R5bGUpIHtcclxuXHRcdHJldHVybiB0aGlzLmludm9rZSgnc2V0U3R5bGUnLCBzdHlsZSk7XHJcblx0fSxcclxuXHJcblx0YnJpbmdUb0Zyb250OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbnZva2UoJ2JyaW5nVG9Gcm9udCcpO1xyXG5cdH0sXHJcblxyXG5cdGJyaW5nVG9CYWNrOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbnZva2UoJ2JyaW5nVG9CYWNrJyk7XHJcblx0fSxcclxuXHJcblx0Z2V0Qm91bmRzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgYm91bmRzID0gbmV3IEwuTGF0TG5nQm91bmRzKCk7XHJcblxyXG5cdFx0dGhpcy5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRcdGJvdW5kcy5leHRlbmQobGF5ZXIgaW5zdGFuY2VvZiBMLk1hcmtlciA/IGxheWVyLmdldExhdExuZygpIDogbGF5ZXIuZ2V0Qm91bmRzKCkpO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0cmV0dXJuIGJvdW5kcztcclxuXHR9LFxyXG5cclxuXHRfcHJvcGFnYXRlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRlID0gTC5leHRlbmQoe1xyXG5cdFx0XHRsYXllcjogZS50YXJnZXQsXHJcblx0XHRcdHRhcmdldDogdGhpc1xyXG5cdFx0fSwgZSk7XHJcblx0XHR0aGlzLmZpcmUoZS50eXBlLCBlKTtcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5mZWF0dXJlR3JvdXAgPSBmdW5jdGlvbiAobGF5ZXJzKSB7XHJcblx0cmV0dXJuIG5ldyBMLkZlYXR1cmVHcm91cChsYXllcnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5QYXRoIGlzIGEgYmFzZSBjbGFzcyBmb3IgcmVuZGVyaW5nIHZlY3RvciBwYXRocyBvbiBhIG1hcC4gSW5oZXJpdGVkIGJ5IFBvbHlsaW5lLCBDaXJjbGUsIGV0Yy5cclxuICovXHJcblxyXG5MLlBhdGggPSBMLkNsYXNzLmV4dGVuZCh7XHJcblx0aW5jbHVkZXM6IFtMLk1peGluLkV2ZW50c10sXHJcblxyXG5cdHN0YXRpY3M6IHtcclxuXHRcdC8vIGhvdyBtdWNoIHRvIGV4dGVuZCB0aGUgY2xpcCBhcmVhIGFyb3VuZCB0aGUgbWFwIHZpZXdcclxuXHRcdC8vIChyZWxhdGl2ZSB0byBpdHMgc2l6ZSwgZS5nLiAwLjUgaXMgaGFsZiB0aGUgc2NyZWVuIGluIGVhY2ggZGlyZWN0aW9uKVxyXG5cdFx0Ly8gc2V0IGl0IHNvIHRoYXQgU1ZHIGVsZW1lbnQgZG9lc24ndCBleGNlZWQgMTI4MHB4ICh2ZWN0b3JzIGZsaWNrZXIgb24gZHJhZ2VuZCBpZiBpdCBpcylcclxuXHRcdENMSVBfUEFERElORzogKGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0dmFyIG1heCA9IEwuQnJvd3Nlci5tb2JpbGUgPyAxMjgwIDogMjAwMCxcclxuXHRcdFx0ICAgIHRhcmdldCA9IChtYXggLyBNYXRoLm1heCh3aW5kb3cub3V0ZXJXaWR0aCwgd2luZG93Lm91dGVySGVpZ2h0KSAtIDEpIC8gMjtcclxuXHRcdFx0cmV0dXJuIE1hdGgubWF4KDAsIE1hdGgubWluKDAuNSwgdGFyZ2V0KSk7XHJcblx0XHR9KSgpXHJcblx0fSxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0c3Ryb2tlOiB0cnVlLFxyXG5cdFx0Y29sb3I6ICcjMDAzM2ZmJyxcclxuXHRcdGRhc2hBcnJheTogbnVsbCxcclxuXHRcdGxpbmVDYXA6IG51bGwsXHJcblx0XHRsaW5lSm9pbjogbnVsbCxcclxuXHRcdHdlaWdodDogNSxcclxuXHRcdG9wYWNpdHk6IDAuNSxcclxuXHJcblx0XHRmaWxsOiBmYWxzZSxcclxuXHRcdGZpbGxDb2xvcjogbnVsbCwgLy9zYW1lIGFzIGNvbG9yIGJ5IGRlZmF1bHRcclxuXHRcdGZpbGxPcGFjaXR5OiAwLjIsXHJcblxyXG5cdFx0Y2xpY2thYmxlOiB0cnVlXHJcblx0fSxcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRvbkFkZDogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5fbWFwID0gbWFwO1xyXG5cclxuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XHJcblx0XHRcdHRoaXMuX2luaXRFbGVtZW50cygpO1xyXG5cdFx0XHR0aGlzLl9pbml0RXZlbnRzKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5wcm9qZWN0TGF0bG5ncygpO1xyXG5cdFx0dGhpcy5fdXBkYXRlUGF0aCgpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0dGhpcy5fbWFwLl9wYXRoUm9vdC5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuZmlyZSgnYWRkJyk7XHJcblxyXG5cdFx0bWFwLm9uKHtcclxuXHRcdFx0J3ZpZXdyZXNldCc6IHRoaXMucHJvamVjdExhdGxuZ3MsXHJcblx0XHRcdCdtb3ZlZW5kJzogdGhpcy5fdXBkYXRlUGF0aFxyXG5cdFx0fSwgdGhpcyk7XHJcblx0fSxcclxuXHJcblx0YWRkVG86IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdG1hcC5hZGRMYXllcih0aGlzKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuX3BhdGhSb290LnJlbW92ZUNoaWxkKHRoaXMuX2NvbnRhaW5lcik7XHJcblxyXG5cdFx0Ly8gTmVlZCB0byBmaXJlIHJlbW92ZSBldmVudCBiZWZvcmUgd2Ugc2V0IF9tYXAgdG8gbnVsbCBhcyB0aGUgZXZlbnQgaG9va3MgbWlnaHQgbmVlZCB0aGUgb2JqZWN0XHJcblx0XHR0aGlzLmZpcmUoJ3JlbW92ZScpO1xyXG5cdFx0dGhpcy5fbWFwID0gbnVsbDtcclxuXHJcblx0XHRpZiAoTC5Ccm93c2VyLnZtbCkge1xyXG5cdFx0XHR0aGlzLl9jb250YWluZXIgPSBudWxsO1xyXG5cdFx0XHR0aGlzLl9zdHJva2UgPSBudWxsO1xyXG5cdFx0XHR0aGlzLl9maWxsID0gbnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRtYXAub2ZmKHtcclxuXHRcdFx0J3ZpZXdyZXNldCc6IHRoaXMucHJvamVjdExhdGxuZ3MsXHJcblx0XHRcdCdtb3ZlZW5kJzogdGhpcy5fdXBkYXRlUGF0aFxyXG5cdFx0fSwgdGhpcyk7XHJcblx0fSxcclxuXHJcblx0cHJvamVjdExhdGxuZ3M6IGZ1bmN0aW9uICgpIHtcclxuXHRcdC8vIGRvIGFsbCBwcm9qZWN0aW9uIHN0dWZmIGhlcmVcclxuXHR9LFxyXG5cclxuXHRzZXRTdHlsZTogZnVuY3Rpb24gKHN0eWxlKSB7XHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgc3R5bGUpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0dGhpcy5fdXBkYXRlU3R5bGUoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRyZWRyYXc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9tYXApIHtcclxuXHRcdFx0dGhpcy5wcm9qZWN0TGF0bG5ncygpO1xyXG5cdFx0XHR0aGlzLl91cGRhdGVQYXRoKCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5NYXAuaW5jbHVkZSh7XHJcblx0X3VwZGF0ZVBhdGhWaWV3cG9ydDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHAgPSBMLlBhdGguQ0xJUF9QQURESU5HLFxyXG5cdFx0ICAgIHNpemUgPSB0aGlzLmdldFNpemUoKSxcclxuXHRcdCAgICBwYW5lUG9zID0gTC5Eb21VdGlsLmdldFBvc2l0aW9uKHRoaXMuX21hcFBhbmUpLFxyXG5cdFx0ICAgIG1pbiA9IHBhbmVQb3MubXVsdGlwbHlCeSgtMSkuX3N1YnRyYWN0KHNpemUubXVsdGlwbHlCeShwKS5fcm91bmQoKSksXHJcblx0XHQgICAgbWF4ID0gbWluLmFkZChzaXplLm11bHRpcGx5QnkoMSArIHAgKiAyKS5fcm91bmQoKSk7XHJcblxyXG5cdFx0dGhpcy5fcGF0aFZpZXdwb3J0ID0gbmV3IEwuQm91bmRzKG1pbiwgbWF4KTtcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcclxuICogRXh0ZW5kcyBMLlBhdGggd2l0aCBTVkctc3BlY2lmaWMgcmVuZGVyaW5nIGNvZGUuXHJcbiAqL1xyXG5cclxuTC5QYXRoLlNWR19OUyA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XHJcblxyXG5MLkJyb3dzZXIuc3ZnID0gISEoZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TICYmIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhMLlBhdGguU1ZHX05TLCAnc3ZnJykuY3JlYXRlU1ZHUmVjdCk7XHJcblxyXG5MLlBhdGggPSBMLlBhdGguZXh0ZW5kKHtcclxuXHRzdGF0aWNzOiB7XHJcblx0XHRTVkc6IEwuQnJvd3Nlci5zdmdcclxuXHR9LFxyXG5cclxuXHRicmluZ1RvRnJvbnQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciByb290ID0gdGhpcy5fbWFwLl9wYXRoUm9vdCxcclxuXHRcdCAgICBwYXRoID0gdGhpcy5fY29udGFpbmVyO1xyXG5cclxuXHRcdGlmIChwYXRoICYmIHJvb3QubGFzdENoaWxkICE9PSBwYXRoKSB7XHJcblx0XHRcdHJvb3QuYXBwZW5kQ2hpbGQocGF0aCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRicmluZ1RvQmFjazogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHJvb3QgPSB0aGlzLl9tYXAuX3BhdGhSb290LFxyXG5cdFx0ICAgIHBhdGggPSB0aGlzLl9jb250YWluZXIsXHJcblx0XHQgICAgZmlyc3QgPSByb290LmZpcnN0Q2hpbGQ7XHJcblxyXG5cdFx0aWYgKHBhdGggJiYgZmlyc3QgIT09IHBhdGgpIHtcclxuXHRcdFx0cm9vdC5pbnNlcnRCZWZvcmUocGF0aCwgZmlyc3QpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Z2V0UGF0aFN0cmluZzogZnVuY3Rpb24gKCkge1xyXG5cdFx0Ly8gZm9ybSBwYXRoIHN0cmluZyBoZXJlXHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZUVsZW1lbnQ6IGZ1bmN0aW9uIChuYW1lKSB7XHJcblx0XHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKEwuUGF0aC5TVkdfTlMsIG5hbWUpO1xyXG5cdH0sXHJcblxyXG5cdF9pbml0RWxlbWVudHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX21hcC5faW5pdFBhdGhSb290KCk7XHJcblx0XHR0aGlzLl9pbml0UGF0aCgpO1xyXG5cdFx0dGhpcy5faW5pdFN0eWxlKCk7XHJcblx0fSxcclxuXHJcblx0X2luaXRQYXRoOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9jb250YWluZXIgPSB0aGlzLl9jcmVhdGVFbGVtZW50KCdnJyk7XHJcblxyXG5cdFx0dGhpcy5fcGF0aCA9IHRoaXMuX2NyZWF0ZUVsZW1lbnQoJ3BhdGgnKTtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLmNsYXNzTmFtZSkge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fcGF0aCwgdGhpcy5vcHRpb25zLmNsYXNzTmFtZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3BhdGgpO1xyXG5cdH0sXHJcblxyXG5cdF9pbml0U3R5bGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuc3Ryb2tlKSB7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdzdHJva2UtbGluZWpvaW4nLCAncm91bmQnKTtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1saW5lY2FwJywgJ3JvdW5kJyk7XHJcblx0XHR9XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLmZpbGwpIHtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ2ZpbGwtcnVsZScsICdldmVub2RkJyk7XHJcblx0XHR9XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnBvaW50ZXJFdmVudHMpIHtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3BvaW50ZXItZXZlbnRzJywgdGhpcy5vcHRpb25zLnBvaW50ZXJFdmVudHMpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMuY2xpY2thYmxlICYmICF0aGlzLm9wdGlvbnMucG9pbnRlckV2ZW50cykge1xyXG5cdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgncG9pbnRlci1ldmVudHMnLCAnbm9uZScpO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fdXBkYXRlU3R5bGUoKTtcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlU3R5bGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuc3Ryb2tlKSB7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdzdHJva2UnLCB0aGlzLm9wdGlvbnMuY29sb3IpO1xyXG5cdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLW9wYWNpdHknLCB0aGlzLm9wdGlvbnMub3BhY2l0eSk7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCB0aGlzLm9wdGlvbnMud2VpZ2h0KTtcclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5kYXNoQXJyYXkpIHtcclxuXHRcdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLWRhc2hhcnJheScsIHRoaXMub3B0aW9ucy5kYXNoQXJyYXkpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHRoaXMuX3BhdGgucmVtb3ZlQXR0cmlidXRlKCdzdHJva2UtZGFzaGFycmF5Jyk7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5saW5lQ2FwKSB7XHJcblx0XHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1saW5lY2FwJywgdGhpcy5vcHRpb25zLmxpbmVDYXApO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMubGluZUpvaW4pIHtcclxuXHRcdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLWxpbmVqb2luJywgdGhpcy5vcHRpb25zLmxpbmVKb2luKTtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsICdub25lJyk7XHJcblx0XHR9XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLmZpbGwpIHtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCB0aGlzLm9wdGlvbnMuZmlsbENvbG9yIHx8IHRoaXMub3B0aW9ucy5jb2xvcik7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdmaWxsLW9wYWNpdHknLCB0aGlzLm9wdGlvbnMuZmlsbE9wYWNpdHkpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnbm9uZScpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVQYXRoOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgc3RyID0gdGhpcy5nZXRQYXRoU3RyaW5nKCk7XHJcblx0XHRpZiAoIXN0cikge1xyXG5cdFx0XHQvLyBmaXggd2Via2l0IGVtcHR5IHN0cmluZyBwYXJzaW5nIGJ1Z1xyXG5cdFx0XHRzdHIgPSAnTTAgMCc7XHJcblx0XHR9XHJcblx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnZCcsIHN0cik7XHJcblx0fSxcclxuXHJcblx0Ly8gVE9ETyByZW1vdmUgZHVwbGljYXRpb24gd2l0aCBMLk1hcFxyXG5cdF9pbml0RXZlbnRzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLmNsaWNrYWJsZSkge1xyXG5cdFx0XHRpZiAoTC5Ccm93c2VyLnN2ZyB8fCAhTC5Ccm93c2VyLnZtbCkge1xyXG5cdFx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9wYXRoLCAnbGVhZmxldC1jbGlja2FibGUnKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0TC5Eb21FdmVudC5vbih0aGlzLl9jb250YWluZXIsICdjbGljaycsIHRoaXMuX29uTW91c2VDbGljaywgdGhpcyk7XHJcblxyXG5cdFx0XHR2YXIgZXZlbnRzID0gWydkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2VvdmVyJyxcclxuXHRcdFx0ICAgICAgICAgICAgICAnbW91c2VvdXQnLCAnbW91c2Vtb3ZlJywgJ2NvbnRleHRtZW51J107XHJcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgZXZlbnRzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdFx0TC5Eb21FdmVudC5vbih0aGlzLl9jb250YWluZXIsIGV2ZW50c1tpXSwgdGhpcy5fZmlyZU1vdXNlRXZlbnQsIHRoaXMpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X29uTW91c2VDbGljazogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGlmICh0aGlzLl9tYXAuZHJhZ2dpbmcgJiYgdGhpcy5fbWFwLmRyYWdnaW5nLm1vdmVkKCkpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dGhpcy5fZmlyZU1vdXNlRXZlbnQoZSk7XHJcblx0fSxcclxuXHJcblx0X2ZpcmVNb3VzZUV2ZW50OiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0aWYgKCF0aGlzLmhhc0V2ZW50TGlzdGVuZXJzKGUudHlwZSkpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcclxuXHRcdCAgICBjb250YWluZXJQb2ludCA9IG1hcC5tb3VzZUV2ZW50VG9Db250YWluZXJQb2ludChlKSxcclxuXHRcdCAgICBsYXllclBvaW50ID0gbWFwLmNvbnRhaW5lclBvaW50VG9MYXllclBvaW50KGNvbnRhaW5lclBvaW50KSxcclxuXHRcdCAgICBsYXRsbmcgPSBtYXAubGF5ZXJQb2ludFRvTGF0TG5nKGxheWVyUG9pbnQpO1xyXG5cclxuXHRcdHRoaXMuZmlyZShlLnR5cGUsIHtcclxuXHRcdFx0bGF0bG5nOiBsYXRsbmcsXHJcblx0XHRcdGxheWVyUG9pbnQ6IGxheWVyUG9pbnQsXHJcblx0XHRcdGNvbnRhaW5lclBvaW50OiBjb250YWluZXJQb2ludCxcclxuXHRcdFx0b3JpZ2luYWxFdmVudDogZVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0aWYgKGUudHlwZSA9PT0gJ2NvbnRleHRtZW51Jykge1xyXG5cdFx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGUudHlwZSAhPT0gJ21vdXNlbW92ZScpIHtcclxuXHRcdFx0TC5Eb21FdmVudC5zdG9wUHJvcGFnYXRpb24oZSk7XHJcblx0XHR9XHJcblx0fVxyXG59KTtcclxuXHJcbkwuTWFwLmluY2x1ZGUoe1xyXG5cdF9pbml0UGF0aFJvb3Q6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICghdGhpcy5fcGF0aFJvb3QpIHtcclxuXHRcdFx0dGhpcy5fcGF0aFJvb3QgPSBMLlBhdGgucHJvdG90eXBlLl9jcmVhdGVFbGVtZW50KCdzdmcnKTtcclxuXHRcdFx0dGhpcy5fcGFuZXMub3ZlcmxheVBhbmUuYXBwZW5kQ2hpbGQodGhpcy5fcGF0aFJvb3QpO1xyXG5cclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy56b29tQW5pbWF0aW9uICYmIEwuQnJvd3Nlci5hbnkzZCkge1xyXG5cdFx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9wYXRoUm9vdCwgJ2xlYWZsZXQtem9vbS1hbmltYXRlZCcpO1xyXG5cclxuXHRcdFx0XHR0aGlzLm9uKHtcclxuXHRcdFx0XHRcdCd6b29tYW5pbSc6IHRoaXMuX2FuaW1hdGVQYXRoWm9vbSxcclxuXHRcdFx0XHRcdCd6b29tZW5kJzogdGhpcy5fZW5kUGF0aFpvb21cclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fcGF0aFJvb3QsICdsZWFmbGV0LXpvb20taGlkZScpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR0aGlzLm9uKCdtb3ZlZW5kJywgdGhpcy5fdXBkYXRlU3ZnVmlld3BvcnQpO1xyXG5cdFx0XHR0aGlzLl91cGRhdGVTdmdWaWV3cG9ydCgpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9hbmltYXRlUGF0aFpvb206IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR2YXIgc2NhbGUgPSB0aGlzLmdldFpvb21TY2FsZShlLnpvb20pLFxyXG5cdFx0ICAgIG9mZnNldCA9IHRoaXMuX2dldENlbnRlck9mZnNldChlLmNlbnRlcikuX211bHRpcGx5QnkoLXNjYWxlKS5fYWRkKHRoaXMuX3BhdGhWaWV3cG9ydC5taW4pO1xyXG5cclxuXHRcdHRoaXMuX3BhdGhSb290LnN0eWxlW0wuRG9tVXRpbC5UUkFOU0ZPUk1dID1cclxuXHRcdCAgICAgICAgTC5Eb21VdGlsLmdldFRyYW5zbGF0ZVN0cmluZyhvZmZzZXQpICsgJyBzY2FsZSgnICsgc2NhbGUgKyAnKSAnO1xyXG5cclxuXHRcdHRoaXMuX3BhdGhab29taW5nID0gdHJ1ZTtcclxuXHR9LFxyXG5cclxuXHRfZW5kUGF0aFpvb206IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX3BhdGhab29taW5nID0gZmFsc2U7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVN2Z1ZpZXdwb3J0OiBmdW5jdGlvbiAoKSB7XHJcblxyXG5cdFx0aWYgKHRoaXMuX3BhdGhab29taW5nKSB7XHJcblx0XHRcdC8vIERvIG5vdCB1cGRhdGUgU1ZHcyB3aGlsZSBhIHpvb20gYW5pbWF0aW9uIGlzIGdvaW5nIG9uIG90aGVyd2lzZSB0aGUgYW5pbWF0aW9uIHdpbGwgYnJlYWsuXHJcblx0XHRcdC8vIFdoZW4gdGhlIHpvb20gYW5pbWF0aW9uIGVuZHMgd2Ugd2lsbCBiZSB1cGRhdGVkIGFnYWluIGFueXdheVxyXG5cdFx0XHQvLyBUaGlzIGZpeGVzIHRoZSBjYXNlIHdoZXJlIHlvdSBkbyBhIG1vbWVudHVtIG1vdmUgYW5kIHpvb20gd2hpbGUgdGhlIG1vdmUgaXMgc3RpbGwgb25nb2luZy5cclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3VwZGF0ZVBhdGhWaWV3cG9ydCgpO1xyXG5cclxuXHRcdHZhciB2cCA9IHRoaXMuX3BhdGhWaWV3cG9ydCxcclxuXHRcdCAgICBtaW4gPSB2cC5taW4sXHJcblx0XHQgICAgbWF4ID0gdnAubWF4LFxyXG5cdFx0ICAgIHdpZHRoID0gbWF4LnggLSBtaW4ueCxcclxuXHRcdCAgICBoZWlnaHQgPSBtYXgueSAtIG1pbi55LFxyXG5cdFx0ICAgIHJvb3QgPSB0aGlzLl9wYXRoUm9vdCxcclxuXHRcdCAgICBwYW5lID0gdGhpcy5fcGFuZXMub3ZlcmxheVBhbmU7XHJcblxyXG5cdFx0Ly8gSGFjayB0byBtYWtlIGZsaWNrZXIgb24gZHJhZyBlbmQgb24gbW9iaWxlIHdlYmtpdCBsZXNzIGlycml0YXRpbmdcclxuXHRcdGlmIChMLkJyb3dzZXIubW9iaWxlV2Via2l0KSB7XHJcblx0XHRcdHBhbmUucmVtb3ZlQ2hpbGQocm9vdCk7XHJcblx0XHR9XHJcblxyXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHJvb3QsIG1pbik7XHJcblx0XHRyb290LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB3aWR0aCk7XHJcblx0XHRyb290LnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgaGVpZ2h0KTtcclxuXHRcdHJvb3Quc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgW21pbi54LCBtaW4ueSwgd2lkdGgsIGhlaWdodF0uam9pbignICcpKTtcclxuXHJcblx0XHRpZiAoTC5Ccm93c2VyLm1vYmlsZVdlYmtpdCkge1xyXG5cdFx0XHRwYW5lLmFwcGVuZENoaWxkKHJvb3QpO1xyXG5cdFx0fVxyXG5cdH1cclxufSk7XHJcblxuXG4vKlxyXG4gKiBQb3B1cCBleHRlbnNpb24gdG8gTC5QYXRoIChwb2x5bGluZXMsIHBvbHlnb25zLCBjaXJjbGVzKSwgYWRkaW5nIHBvcHVwLXJlbGF0ZWQgbWV0aG9kcy5cclxuICovXHJcblxyXG5MLlBhdGguaW5jbHVkZSh7XHJcblxyXG5cdGJpbmRQb3B1cDogZnVuY3Rpb24gKGNvbnRlbnQsIG9wdGlvbnMpIHtcclxuXHJcblx0XHRpZiAoY29udGVudCBpbnN0YW5jZW9mIEwuUG9wdXApIHtcclxuXHRcdFx0dGhpcy5fcG9wdXAgPSBjb250ZW50O1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aWYgKCF0aGlzLl9wb3B1cCB8fCBvcHRpb25zKSB7XHJcblx0XHRcdFx0dGhpcy5fcG9wdXAgPSBuZXcgTC5Qb3B1cChvcHRpb25zLCB0aGlzKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLl9wb3B1cC5zZXRDb250ZW50KGNvbnRlbnQpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICghdGhpcy5fcG9wdXBIYW5kbGVyc0FkZGVkKSB7XHJcblx0XHRcdHRoaXNcclxuXHRcdFx0ICAgIC5vbignY2xpY2snLCB0aGlzLl9vcGVuUG9wdXAsIHRoaXMpXHJcblx0XHRcdCAgICAub24oJ3JlbW92ZScsIHRoaXMuY2xvc2VQb3B1cCwgdGhpcyk7XHJcblxyXG5cdFx0XHR0aGlzLl9wb3B1cEhhbmRsZXJzQWRkZWQgPSB0cnVlO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHVuYmluZFBvcHVwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fcG9wdXApIHtcclxuXHRcdFx0dGhpcy5fcG9wdXAgPSBudWxsO1xyXG5cdFx0XHR0aGlzXHJcblx0XHRcdCAgICAub2ZmKCdjbGljaycsIHRoaXMuX29wZW5Qb3B1cClcclxuXHRcdFx0ICAgIC5vZmYoJ3JlbW92ZScsIHRoaXMuY2xvc2VQb3B1cCk7XHJcblxyXG5cdFx0XHR0aGlzLl9wb3B1cEhhbmRsZXJzQWRkZWQgPSBmYWxzZTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdG9wZW5Qb3B1cDogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cclxuXHRcdGlmICh0aGlzLl9wb3B1cCkge1xyXG5cdFx0XHQvLyBvcGVuIHRoZSBwb3B1cCBmcm9tIG9uZSBvZiB0aGUgcGF0aCdzIHBvaW50cyBpZiBub3Qgc3BlY2lmaWVkXHJcblx0XHRcdGxhdGxuZyA9IGxhdGxuZyB8fCB0aGlzLl9sYXRsbmcgfHxcclxuXHRcdFx0ICAgICAgICAgdGhpcy5fbGF0bG5nc1tNYXRoLmZsb29yKHRoaXMuX2xhdGxuZ3MubGVuZ3RoIC8gMildO1xyXG5cclxuXHRcdFx0dGhpcy5fb3BlblBvcHVwKHtsYXRsbmc6IGxhdGxuZ30pO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGNsb3NlUG9wdXA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9wb3B1cCkge1xyXG5cdFx0XHR0aGlzLl9wb3B1cC5fY2xvc2UoKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF9vcGVuUG9wdXA6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR0aGlzLl9wb3B1cC5zZXRMYXRMbmcoZS5sYXRsbmcpO1xyXG5cdFx0dGhpcy5fbWFwLm9wZW5Qb3B1cCh0aGlzLl9wb3B1cCk7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIFZlY3RvciByZW5kZXJpbmcgZm9yIElFNi04IHRocm91Z2ggVk1MLlxyXG4gKiBUaGFua3MgdG8gRG1pdHJ5IEJhcmFub3Zza3kgYW5kIGhpcyBSYXBoYWVsIGxpYnJhcnkgZm9yIGluc3BpcmF0aW9uIVxyXG4gKi9cclxuXHJcbkwuQnJvd3Nlci52bWwgPSAhTC5Ccm93c2VyLnN2ZyAmJiAoZnVuY3Rpb24gKCkge1xyXG5cdHRyeSB7XHJcblx0XHR2YXIgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcblx0XHRkaXYuaW5uZXJIVE1MID0gJzx2OnNoYXBlIGFkaj1cIjFcIi8+JztcclxuXHJcblx0XHR2YXIgc2hhcGUgPSBkaXYuZmlyc3RDaGlsZDtcclxuXHRcdHNoYXBlLnN0eWxlLmJlaGF2aW9yID0gJ3VybCgjZGVmYXVsdCNWTUwpJztcclxuXHJcblx0XHRyZXR1cm4gc2hhcGUgJiYgKHR5cGVvZiBzaGFwZS5hZGogPT09ICdvYmplY3QnKTtcclxuXHJcblx0fSBjYXRjaCAoZSkge1xyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH1cclxufSgpKTtcclxuXHJcbkwuUGF0aCA9IEwuQnJvd3Nlci5zdmcgfHwgIUwuQnJvd3Nlci52bWwgPyBMLlBhdGggOiBMLlBhdGguZXh0ZW5kKHtcclxuXHRzdGF0aWNzOiB7XHJcblx0XHRWTUw6IHRydWUsXHJcblx0XHRDTElQX1BBRERJTkc6IDAuMDJcclxuXHR9LFxyXG5cclxuXHRfY3JlYXRlRWxlbWVudDogKGZ1bmN0aW9uICgpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdGRvY3VtZW50Lm5hbWVzcGFjZXMuYWRkKCdsdm1sJywgJ3VybjpzY2hlbWFzLW1pY3Jvc29mdC1jb206dm1sJyk7XHJcblx0XHRcdHJldHVybiBmdW5jdGlvbiAobmFtZSkge1xyXG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCc8bHZtbDonICsgbmFtZSArICcgY2xhc3M9XCJsdm1sXCI+Jyk7XHJcblx0XHRcdH07XHJcblx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdHJldHVybiBmdW5jdGlvbiAobmFtZSkge1xyXG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFxyXG5cdFx0XHRcdCAgICAgICAgJzwnICsgbmFtZSArICcgeG1sbnM9XCJ1cm46c2NoZW1hcy1taWNyb3NvZnQuY29tOnZtbFwiIGNsYXNzPVwibHZtbFwiPicpO1xyXG5cdFx0XHR9O1xyXG5cdFx0fVxyXG5cdH0oKSksXHJcblxyXG5cdF9pbml0UGF0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lciA9IHRoaXMuX2NyZWF0ZUVsZW1lbnQoJ3NoYXBlJyk7XHJcblxyXG5cdFx0TC5Eb21VdGlsLmFkZENsYXNzKGNvbnRhaW5lciwgJ2xlYWZsZXQtdm1sLXNoYXBlJyArXHJcblx0XHRcdCh0aGlzLm9wdGlvbnMuY2xhc3NOYW1lID8gJyAnICsgdGhpcy5vcHRpb25zLmNsYXNzTmFtZSA6ICcnKSk7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5jbGlja2FibGUpIHtcclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKGNvbnRhaW5lciwgJ2xlYWZsZXQtY2xpY2thYmxlJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0Y29udGFpbmVyLmNvb3Jkc2l6ZSA9ICcxIDEnO1xyXG5cclxuXHRcdHRoaXMuX3BhdGggPSB0aGlzLl9jcmVhdGVFbGVtZW50KCdwYXRoJyk7XHJcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fcGF0aCk7XHJcblxyXG5cdFx0dGhpcy5fbWFwLl9wYXRoUm9vdC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xyXG5cdH0sXHJcblxyXG5cdF9pbml0U3R5bGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX3VwZGF0ZVN0eWxlKCk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVN0eWxlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgc3Ryb2tlID0gdGhpcy5fc3Ryb2tlLFxyXG5cdFx0ICAgIGZpbGwgPSB0aGlzLl9maWxsLFxyXG5cdFx0ICAgIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMsXHJcblx0XHQgICAgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyO1xyXG5cclxuXHRcdGNvbnRhaW5lci5zdHJva2VkID0gb3B0aW9ucy5zdHJva2U7XHJcblx0XHRjb250YWluZXIuZmlsbGVkID0gb3B0aW9ucy5maWxsO1xyXG5cclxuXHRcdGlmIChvcHRpb25zLnN0cm9rZSkge1xyXG5cdFx0XHRpZiAoIXN0cm9rZSkge1xyXG5cdFx0XHRcdHN0cm9rZSA9IHRoaXMuX3N0cm9rZSA9IHRoaXMuX2NyZWF0ZUVsZW1lbnQoJ3N0cm9rZScpO1xyXG5cdFx0XHRcdHN0cm9rZS5lbmRjYXAgPSAncm91bmQnO1xyXG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzdHJva2UpO1xyXG5cdFx0XHR9XHJcblx0XHRcdHN0cm9rZS53ZWlnaHQgPSBvcHRpb25zLndlaWdodCArICdweCc7XHJcblx0XHRcdHN0cm9rZS5jb2xvciA9IG9wdGlvbnMuY29sb3I7XHJcblx0XHRcdHN0cm9rZS5vcGFjaXR5ID0gb3B0aW9ucy5vcGFjaXR5O1xyXG5cclxuXHRcdFx0aWYgKG9wdGlvbnMuZGFzaEFycmF5KSB7XHJcblx0XHRcdFx0c3Ryb2tlLmRhc2hTdHlsZSA9IEwuVXRpbC5pc0FycmF5KG9wdGlvbnMuZGFzaEFycmF5KSA/XHJcblx0XHRcdFx0ICAgIG9wdGlvbnMuZGFzaEFycmF5LmpvaW4oJyAnKSA6XHJcblx0XHRcdFx0ICAgIG9wdGlvbnMuZGFzaEFycmF5LnJlcGxhY2UoLyggKiwgKikvZywgJyAnKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRzdHJva2UuZGFzaFN0eWxlID0gJyc7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKG9wdGlvbnMubGluZUNhcCkge1xyXG5cdFx0XHRcdHN0cm9rZS5lbmRjYXAgPSBvcHRpb25zLmxpbmVDYXAucmVwbGFjZSgnYnV0dCcsICdmbGF0Jyk7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKG9wdGlvbnMubGluZUpvaW4pIHtcclxuXHRcdFx0XHRzdHJva2Uuam9pbnN0eWxlID0gb3B0aW9ucy5saW5lSm9pbjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdH0gZWxzZSBpZiAoc3Ryb2tlKSB7XHJcblx0XHRcdGNvbnRhaW5lci5yZW1vdmVDaGlsZChzdHJva2UpO1xyXG5cdFx0XHR0aGlzLl9zdHJva2UgPSBudWxsO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChvcHRpb25zLmZpbGwpIHtcclxuXHRcdFx0aWYgKCFmaWxsKSB7XHJcblx0XHRcdFx0ZmlsbCA9IHRoaXMuX2ZpbGwgPSB0aGlzLl9jcmVhdGVFbGVtZW50KCdmaWxsJyk7XHJcblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGZpbGwpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGZpbGwuY29sb3IgPSBvcHRpb25zLmZpbGxDb2xvciB8fCBvcHRpb25zLmNvbG9yO1xyXG5cdFx0XHRmaWxsLm9wYWNpdHkgPSBvcHRpb25zLmZpbGxPcGFjaXR5O1xyXG5cclxuXHRcdH0gZWxzZSBpZiAoZmlsbCkge1xyXG5cdFx0XHRjb250YWluZXIucmVtb3ZlQ2hpbGQoZmlsbCk7XHJcblx0XHRcdHRoaXMuX2ZpbGwgPSBudWxsO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVQYXRoOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgc3R5bGUgPSB0aGlzLl9jb250YWluZXIuc3R5bGU7XHJcblxyXG5cdFx0c3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuXHRcdHRoaXMuX3BhdGgudiA9IHRoaXMuZ2V0UGF0aFN0cmluZygpICsgJyAnOyAvLyB0aGUgc3BhY2UgZml4ZXMgSUUgZW1wdHkgcGF0aCBzdHJpbmcgYnVnXHJcblx0XHRzdHlsZS5kaXNwbGF5ID0gJyc7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuTWFwLmluY2x1ZGUoTC5Ccm93c2VyLnN2ZyB8fCAhTC5Ccm93c2VyLnZtbCA/IHt9IDoge1xyXG5cdF9pbml0UGF0aFJvb3Q6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9wYXRoUm9vdCkgeyByZXR1cm47IH1cclxuXHJcblx0XHR2YXIgcm9vdCA9IHRoaXMuX3BhdGhSb290ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcblx0XHRyb290LmNsYXNzTmFtZSA9ICdsZWFmbGV0LXZtbC1jb250YWluZXInO1xyXG5cdFx0dGhpcy5fcGFuZXMub3ZlcmxheVBhbmUuYXBwZW5kQ2hpbGQocm9vdCk7XHJcblxyXG5cdFx0dGhpcy5vbignbW92ZWVuZCcsIHRoaXMuX3VwZGF0ZVBhdGhWaWV3cG9ydCk7XHJcblx0XHR0aGlzLl91cGRhdGVQYXRoVmlld3BvcnQoKTtcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcclxuICogVmVjdG9yIHJlbmRlcmluZyBmb3IgYWxsIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBjYW52YXMuXHJcbiAqL1xyXG5cclxuTC5Ccm93c2VyLmNhbnZhcyA9IChmdW5jdGlvbiAoKSB7XHJcblx0cmV0dXJuICEhZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJykuZ2V0Q29udGV4dDtcclxufSgpKTtcclxuXHJcbkwuUGF0aCA9IChMLlBhdGguU1ZHICYmICF3aW5kb3cuTF9QUkVGRVJfQ0FOVkFTKSB8fCAhTC5Ccm93c2VyLmNhbnZhcyA/IEwuUGF0aCA6IEwuUGF0aC5leHRlbmQoe1xyXG5cdHN0YXRpY3M6IHtcclxuXHRcdC8vQ0xJUF9QQURESU5HOiAwLjAyLCAvLyBub3Qgc3VyZSBpZiB0aGVyZSdzIGEgbmVlZCB0byBzZXQgaXQgdG8gYSBzbWFsbCB2YWx1ZVxyXG5cdFx0Q0FOVkFTOiB0cnVlLFxyXG5cdFx0U1ZHOiBmYWxzZVxyXG5cdH0sXHJcblxyXG5cdHJlZHJhdzogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMuX21hcCkge1xyXG5cdFx0XHR0aGlzLnByb2plY3RMYXRsbmdzKCk7XHJcblx0XHRcdHRoaXMuX3JlcXVlc3RVcGRhdGUoKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHNldFN0eWxlOiBmdW5jdGlvbiAoc3R5bGUpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBzdHlsZSk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX21hcCkge1xyXG5cdFx0XHR0aGlzLl91cGRhdGVTdHlsZSgpO1xyXG5cdFx0XHR0aGlzLl9yZXF1ZXN0VXBkYXRlKCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0bWFwXHJcblx0XHQgICAgLm9mZigndmlld3Jlc2V0JywgdGhpcy5wcm9qZWN0TGF0bG5ncywgdGhpcylcclxuXHRcdCAgICAub2ZmKCdtb3ZlZW5kJywgdGhpcy5fdXBkYXRlUGF0aCwgdGhpcyk7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5jbGlja2FibGUpIHtcclxuXHRcdFx0dGhpcy5fbWFwLm9mZignY2xpY2snLCB0aGlzLl9vbkNsaWNrLCB0aGlzKTtcclxuXHRcdFx0dGhpcy5fbWFwLm9mZignbW91c2Vtb3ZlJywgdGhpcy5fb25Nb3VzZU1vdmUsIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3JlcXVlc3RVcGRhdGUoKTtcclxuXHRcdFxyXG5cdFx0dGhpcy5maXJlKCdyZW1vdmUnKTtcclxuXHRcdHRoaXMuX21hcCA9IG51bGw7XHJcblx0fSxcclxuXHJcblx0X3JlcXVlc3RVcGRhdGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9tYXAgJiYgIUwuUGF0aC5fdXBkYXRlUmVxdWVzdCkge1xyXG5cdFx0XHRMLlBhdGguX3VwZGF0ZVJlcXVlc3QgPSBMLlV0aWwucmVxdWVzdEFuaW1GcmFtZSh0aGlzLl9maXJlTWFwTW92ZUVuZCwgdGhpcy5fbWFwKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfZmlyZU1hcE1vdmVFbmQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuUGF0aC5fdXBkYXRlUmVxdWVzdCA9IG51bGw7XHJcblx0XHR0aGlzLmZpcmUoJ21vdmVlbmQnKTtcclxuXHR9LFxyXG5cclxuXHRfaW5pdEVsZW1lbnRzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9tYXAuX2luaXRQYXRoUm9vdCgpO1xyXG5cdFx0dGhpcy5fY3R4ID0gdGhpcy5fbWFwLl9jYW52YXNDdHg7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVN0eWxlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcclxuXHJcblx0XHRpZiAob3B0aW9ucy5zdHJva2UpIHtcclxuXHRcdFx0dGhpcy5fY3R4LmxpbmVXaWR0aCA9IG9wdGlvbnMud2VpZ2h0O1xyXG5cdFx0XHR0aGlzLl9jdHguc3Ryb2tlU3R5bGUgPSBvcHRpb25zLmNvbG9yO1xyXG5cdFx0fVxyXG5cdFx0aWYgKG9wdGlvbnMuZmlsbCkge1xyXG5cdFx0XHR0aGlzLl9jdHguZmlsbFN0eWxlID0gb3B0aW9ucy5maWxsQ29sb3IgfHwgb3B0aW9ucy5jb2xvcjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAob3B0aW9ucy5saW5lQ2FwKSB7XHJcblx0XHRcdHRoaXMuX2N0eC5saW5lQ2FwID0gb3B0aW9ucy5saW5lQ2FwO1xyXG5cdFx0fVxyXG5cdFx0aWYgKG9wdGlvbnMubGluZUpvaW4pIHtcclxuXHRcdFx0dGhpcy5fY3R4LmxpbmVKb2luID0gb3B0aW9ucy5saW5lSm9pbjtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfZHJhd1BhdGg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBpLCBqLCBsZW4sIGxlbjIsIHBvaW50LCBkcmF3TWV0aG9kO1xyXG5cclxuXHRcdHRoaXMuX2N0eC5iZWdpblBhdGgoKTtcclxuXHJcblx0XHRmb3IgKGkgPSAwLCBsZW4gPSB0aGlzLl9wYXJ0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRmb3IgKGogPSAwLCBsZW4yID0gdGhpcy5fcGFydHNbaV0ubGVuZ3RoOyBqIDwgbGVuMjsgaisrKSB7XHJcblx0XHRcdFx0cG9pbnQgPSB0aGlzLl9wYXJ0c1tpXVtqXTtcclxuXHRcdFx0XHRkcmF3TWV0aG9kID0gKGogPT09IDAgPyAnbW92ZScgOiAnbGluZScpICsgJ1RvJztcclxuXHJcblx0XHRcdFx0dGhpcy5fY3R4W2RyYXdNZXRob2RdKHBvaW50LngsIHBvaW50LnkpO1xyXG5cdFx0XHR9XHJcblx0XHRcdC8vIFRPRE8gcmVmYWN0b3IgdWdseSBoYWNrXHJcblx0XHRcdGlmICh0aGlzIGluc3RhbmNlb2YgTC5Qb2x5Z29uKSB7XHJcblx0XHRcdFx0dGhpcy5fY3R4LmNsb3NlUGF0aCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2NoZWNrSWZFbXB0eTogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuICF0aGlzLl9wYXJ0cy5sZW5ndGg7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVBhdGg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9jaGVja0lmRW1wdHkoKSkgeyByZXR1cm47IH1cclxuXHJcblx0XHR2YXIgY3R4ID0gdGhpcy5fY3R4LFxyXG5cdFx0ICAgIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XHJcblxyXG5cdFx0dGhpcy5fZHJhd1BhdGgoKTtcclxuXHRcdGN0eC5zYXZlKCk7XHJcblx0XHR0aGlzLl91cGRhdGVTdHlsZSgpO1xyXG5cclxuXHRcdGlmIChvcHRpb25zLmZpbGwpIHtcclxuXHRcdFx0Y3R4Lmdsb2JhbEFscGhhID0gb3B0aW9ucy5maWxsT3BhY2l0eTtcclxuXHRcdFx0Y3R4LmZpbGwob3B0aW9ucy5maWxsUnVsZSB8fCAnZXZlbm9kZCcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChvcHRpb25zLnN0cm9rZSkge1xyXG5cdFx0XHRjdHguZ2xvYmFsQWxwaGEgPSBvcHRpb25zLm9wYWNpdHk7XHJcblx0XHRcdGN0eC5zdHJva2UoKTtcclxuXHRcdH1cclxuXHJcblx0XHRjdHgucmVzdG9yZSgpO1xyXG5cclxuXHRcdC8vIFRPRE8gb3B0aW1pemF0aW9uOiAxIGZpbGwvc3Ryb2tlIGZvciBhbGwgZmVhdHVyZXMgd2l0aCBlcXVhbCBzdHlsZSBpbnN0ZWFkIG9mIDEgZm9yIGVhY2ggZmVhdHVyZVxyXG5cdH0sXHJcblxyXG5cdF9pbml0RXZlbnRzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLmNsaWNrYWJsZSkge1xyXG5cdFx0XHR0aGlzLl9tYXAub24oJ21vdXNlbW92ZScsIHRoaXMuX29uTW91c2VNb3ZlLCB0aGlzKTtcclxuXHRcdFx0dGhpcy5fbWFwLm9uKCdjbGljayBkYmxjbGljayBjb250ZXh0bWVudScsIHRoaXMuX2ZpcmVNb3VzZUV2ZW50LCB0aGlzKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfZmlyZU1vdXNlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAodGhpcy5fY29udGFpbnNQb2ludChlLmxheWVyUG9pbnQpKSB7XHJcblx0XHRcdHRoaXMuZmlyZShlLnR5cGUsIGUpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9vbk1vdXNlTW92ZTogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGlmICghdGhpcy5fbWFwIHx8IHRoaXMuX21hcC5fYW5pbWF0aW5nWm9vbSkgeyByZXR1cm47IH1cclxuXHJcblx0XHQvLyBUT0RPIGRvbid0IGRvIG9uIGVhY2ggbW92ZVxyXG5cdFx0aWYgKHRoaXMuX2NvbnRhaW5zUG9pbnQoZS5sYXllclBvaW50KSkge1xyXG5cdFx0XHR0aGlzLl9jdHguY2FudmFzLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcclxuXHRcdFx0dGhpcy5fbW91c2VJbnNpZGUgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLmZpcmUoJ21vdXNlb3ZlcicsIGUpO1xyXG5cclxuXHRcdH0gZWxzZSBpZiAodGhpcy5fbW91c2VJbnNpZGUpIHtcclxuXHRcdFx0dGhpcy5fY3R4LmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnJztcclxuXHRcdFx0dGhpcy5fbW91c2VJbnNpZGUgPSBmYWxzZTtcclxuXHRcdFx0dGhpcy5maXJlKCdtb3VzZW91dCcsIGUpO1xyXG5cdFx0fVxyXG5cdH1cclxufSk7XHJcblxyXG5MLk1hcC5pbmNsdWRlKChMLlBhdGguU1ZHICYmICF3aW5kb3cuTF9QUkVGRVJfQ0FOVkFTKSB8fCAhTC5Ccm93c2VyLmNhbnZhcyA/IHt9IDoge1xyXG5cdF9pbml0UGF0aFJvb3Q6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciByb290ID0gdGhpcy5fcGF0aFJvb3QsXHJcblx0XHQgICAgY3R4O1xyXG5cclxuXHRcdGlmICghcm9vdCkge1xyXG5cdFx0XHRyb290ID0gdGhpcy5fcGF0aFJvb3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuXHRcdFx0cm9vdC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcblx0XHRcdGN0eCA9IHRoaXMuX2NhbnZhc0N0eCA9IHJvb3QuZ2V0Q29udGV4dCgnMmQnKTtcclxuXHJcblx0XHRcdGN0eC5saW5lQ2FwID0gJ3JvdW5kJztcclxuXHRcdFx0Y3R4LmxpbmVKb2luID0gJ3JvdW5kJztcclxuXHJcblx0XHRcdHRoaXMuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHJvb3QpO1xyXG5cclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy56b29tQW5pbWF0aW9uKSB7XHJcblx0XHRcdFx0dGhpcy5fcGF0aFJvb3QuY2xhc3NOYW1lID0gJ2xlYWZsZXQtem9vbS1hbmltYXRlZCc7XHJcblx0XHRcdFx0dGhpcy5vbignem9vbWFuaW0nLCB0aGlzLl9hbmltYXRlUGF0aFpvb20pO1xyXG5cdFx0XHRcdHRoaXMub24oJ3pvb21lbmQnLCB0aGlzLl9lbmRQYXRoWm9vbSk7XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy5vbignbW92ZWVuZCcsIHRoaXMuX3VwZGF0ZUNhbnZhc1ZpZXdwb3J0KTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlQ2FudmFzVmlld3BvcnQoKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlQ2FudmFzVmlld3BvcnQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdC8vIGRvbid0IHJlZHJhdyB3aGlsZSB6b29taW5nLiBTZWUgX3VwZGF0ZVN2Z1ZpZXdwb3J0IGZvciBtb3JlIGRldGFpbHNcclxuXHRcdGlmICh0aGlzLl9wYXRoWm9vbWluZykgeyByZXR1cm47IH1cclxuXHRcdHRoaXMuX3VwZGF0ZVBhdGhWaWV3cG9ydCgpO1xyXG5cclxuXHRcdHZhciB2cCA9IHRoaXMuX3BhdGhWaWV3cG9ydCxcclxuXHRcdCAgICBtaW4gPSB2cC5taW4sXHJcblx0XHQgICAgc2l6ZSA9IHZwLm1heC5zdWJ0cmFjdChtaW4pLFxyXG5cdFx0ICAgIHJvb3QgPSB0aGlzLl9wYXRoUm9vdDtcclxuXHJcblx0XHQvL1RPRE8gY2hlY2sgaWYgdGhpcyB3b3JrcyBwcm9wZXJseSBvbiBtb2JpbGUgd2Via2l0XHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24ocm9vdCwgbWluKTtcclxuXHRcdHJvb3Qud2lkdGggPSBzaXplLng7XHJcblx0XHRyb290LmhlaWdodCA9IHNpemUueTtcclxuXHRcdHJvb3QuZ2V0Q29udGV4dCgnMmQnKS50cmFuc2xhdGUoLW1pbi54LCAtbWluLnkpO1xyXG5cdH1cclxufSk7XHJcblxuXG4vKlxyXG4gKiBMLkxpbmVVdGlsIGNvbnRhaW5zIGRpZmZlcmVudCB1dGlsaXR5IGZ1bmN0aW9ucyBmb3IgbGluZSBzZWdtZW50c1xyXG4gKiBhbmQgcG9seWxpbmVzIChjbGlwcGluZywgc2ltcGxpZmljYXRpb24sIGRpc3RhbmNlcywgZXRjLilcclxuICovXHJcblxyXG4vKmpzaGludCBiaXR3aXNlOmZhbHNlICovIC8vIGFsbG93IGJpdHdpc2Ugb3BlcmF0aW9ucyBmb3IgdGhpcyBmaWxlXHJcblxyXG5MLkxpbmVVdGlsID0ge1xyXG5cclxuXHQvLyBTaW1wbGlmeSBwb2x5bGluZSB3aXRoIHZlcnRleCByZWR1Y3Rpb24gYW5kIERvdWdsYXMtUGV1Y2tlciBzaW1wbGlmaWNhdGlvbi5cclxuXHQvLyBJbXByb3ZlcyByZW5kZXJpbmcgcGVyZm9ybWFuY2UgZHJhbWF0aWNhbGx5IGJ5IGxlc3NlbmluZyB0aGUgbnVtYmVyIG9mIHBvaW50cyB0byBkcmF3LlxyXG5cclxuXHRzaW1wbGlmeTogZnVuY3Rpb24gKC8qUG9pbnRbXSovIHBvaW50cywgLypOdW1iZXIqLyB0b2xlcmFuY2UpIHtcclxuXHRcdGlmICghdG9sZXJhbmNlIHx8ICFwb2ludHMubGVuZ3RoKSB7XHJcblx0XHRcdHJldHVybiBwb2ludHMuc2xpY2UoKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgc3FUb2xlcmFuY2UgPSB0b2xlcmFuY2UgKiB0b2xlcmFuY2U7XHJcblxyXG5cdFx0Ly8gc3RhZ2UgMTogdmVydGV4IHJlZHVjdGlvblxyXG5cdFx0cG9pbnRzID0gdGhpcy5fcmVkdWNlUG9pbnRzKHBvaW50cywgc3FUb2xlcmFuY2UpO1xyXG5cclxuXHRcdC8vIHN0YWdlIDI6IERvdWdsYXMtUGV1Y2tlciBzaW1wbGlmaWNhdGlvblxyXG5cdFx0cG9pbnRzID0gdGhpcy5fc2ltcGxpZnlEUChwb2ludHMsIHNxVG9sZXJhbmNlKTtcclxuXHJcblx0XHRyZXR1cm4gcG9pbnRzO1xyXG5cdH0sXHJcblxyXG5cdC8vIGRpc3RhbmNlIGZyb20gYSBwb2ludCB0byBhIHNlZ21lbnQgYmV0d2VlbiB0d28gcG9pbnRzXHJcblx0cG9pbnRUb1NlZ21lbnREaXN0YW5jZTogIGZ1bmN0aW9uICgvKlBvaW50Ki8gcCwgLypQb2ludCovIHAxLCAvKlBvaW50Ki8gcDIpIHtcclxuXHRcdHJldHVybiBNYXRoLnNxcnQodGhpcy5fc3FDbG9zZXN0UG9pbnRPblNlZ21lbnQocCwgcDEsIHAyLCB0cnVlKSk7XHJcblx0fSxcclxuXHJcblx0Y2xvc2VzdFBvaW50T25TZWdtZW50OiBmdW5jdGlvbiAoLypQb2ludCovIHAsIC8qUG9pbnQqLyBwMSwgLypQb2ludCovIHAyKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fc3FDbG9zZXN0UG9pbnRPblNlZ21lbnQocCwgcDEsIHAyKTtcclxuXHR9LFxyXG5cclxuXHQvLyBEb3VnbGFzLVBldWNrZXIgc2ltcGxpZmljYXRpb24sIHNlZSBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0RvdWdsYXMtUGV1Y2tlcl9hbGdvcml0aG1cclxuXHRfc2ltcGxpZnlEUDogZnVuY3Rpb24gKHBvaW50cywgc3FUb2xlcmFuY2UpIHtcclxuXHJcblx0XHR2YXIgbGVuID0gcG9pbnRzLmxlbmd0aCxcclxuXHRcdCAgICBBcnJheUNvbnN0cnVjdG9yID0gdHlwZW9mIFVpbnQ4QXJyYXkgIT09IHVuZGVmaW5lZCArICcnID8gVWludDhBcnJheSA6IEFycmF5LFxyXG5cdFx0ICAgIG1hcmtlcnMgPSBuZXcgQXJyYXlDb25zdHJ1Y3RvcihsZW4pO1xyXG5cclxuXHRcdG1hcmtlcnNbMF0gPSBtYXJrZXJzW2xlbiAtIDFdID0gMTtcclxuXHJcblx0XHR0aGlzLl9zaW1wbGlmeURQU3RlcChwb2ludHMsIG1hcmtlcnMsIHNxVG9sZXJhbmNlLCAwLCBsZW4gLSAxKTtcclxuXHJcblx0XHR2YXIgaSxcclxuXHRcdCAgICBuZXdQb2ludHMgPSBbXTtcclxuXHJcblx0XHRmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0aWYgKG1hcmtlcnNbaV0pIHtcclxuXHRcdFx0XHRuZXdQb2ludHMucHVzaChwb2ludHNbaV0pO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIG5ld1BvaW50cztcclxuXHR9LFxyXG5cclxuXHRfc2ltcGxpZnlEUFN0ZXA6IGZ1bmN0aW9uIChwb2ludHMsIG1hcmtlcnMsIHNxVG9sZXJhbmNlLCBmaXJzdCwgbGFzdCkge1xyXG5cclxuXHRcdHZhciBtYXhTcURpc3QgPSAwLFxyXG5cdFx0ICAgIGluZGV4LCBpLCBzcURpc3Q7XHJcblxyXG5cdFx0Zm9yIChpID0gZmlyc3QgKyAxOyBpIDw9IGxhc3QgLSAxOyBpKyspIHtcclxuXHRcdFx0c3FEaXN0ID0gdGhpcy5fc3FDbG9zZXN0UG9pbnRPblNlZ21lbnQocG9pbnRzW2ldLCBwb2ludHNbZmlyc3RdLCBwb2ludHNbbGFzdF0sIHRydWUpO1xyXG5cclxuXHRcdFx0aWYgKHNxRGlzdCA+IG1heFNxRGlzdCkge1xyXG5cdFx0XHRcdGluZGV4ID0gaTtcclxuXHRcdFx0XHRtYXhTcURpc3QgPSBzcURpc3Q7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRpZiAobWF4U3FEaXN0ID4gc3FUb2xlcmFuY2UpIHtcclxuXHRcdFx0bWFya2Vyc1tpbmRleF0gPSAxO1xyXG5cclxuXHRcdFx0dGhpcy5fc2ltcGxpZnlEUFN0ZXAocG9pbnRzLCBtYXJrZXJzLCBzcVRvbGVyYW5jZSwgZmlyc3QsIGluZGV4KTtcclxuXHRcdFx0dGhpcy5fc2ltcGxpZnlEUFN0ZXAocG9pbnRzLCBtYXJrZXJzLCBzcVRvbGVyYW5jZSwgaW5kZXgsIGxhc3QpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIHJlZHVjZSBwb2ludHMgdGhhdCBhcmUgdG9vIGNsb3NlIHRvIGVhY2ggb3RoZXIgdG8gYSBzaW5nbGUgcG9pbnRcclxuXHRfcmVkdWNlUG9pbnRzOiBmdW5jdGlvbiAocG9pbnRzLCBzcVRvbGVyYW5jZSkge1xyXG5cdFx0dmFyIHJlZHVjZWRQb2ludHMgPSBbcG9pbnRzWzBdXTtcclxuXHJcblx0XHRmb3IgKHZhciBpID0gMSwgcHJldiA9IDAsIGxlbiA9IHBvaW50cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRpZiAodGhpcy5fc3FEaXN0KHBvaW50c1tpXSwgcG9pbnRzW3ByZXZdKSA+IHNxVG9sZXJhbmNlKSB7XHJcblx0XHRcdFx0cmVkdWNlZFBvaW50cy5wdXNoKHBvaW50c1tpXSk7XHJcblx0XHRcdFx0cHJldiA9IGk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGlmIChwcmV2IDwgbGVuIC0gMSkge1xyXG5cdFx0XHRyZWR1Y2VkUG9pbnRzLnB1c2gocG9pbnRzW2xlbiAtIDFdKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiByZWR1Y2VkUG9pbnRzO1xyXG5cdH0sXHJcblxyXG5cdC8vIENvaGVuLVN1dGhlcmxhbmQgbGluZSBjbGlwcGluZyBhbGdvcml0aG0uXHJcblx0Ly8gVXNlZCB0byBhdm9pZCByZW5kZXJpbmcgcGFydHMgb2YgYSBwb2x5bGluZSB0aGF0IGFyZSBub3QgY3VycmVudGx5IHZpc2libGUuXHJcblxyXG5cdGNsaXBTZWdtZW50OiBmdW5jdGlvbiAoYSwgYiwgYm91bmRzLCB1c2VMYXN0Q29kZSkge1xyXG5cdFx0dmFyIGNvZGVBID0gdXNlTGFzdENvZGUgPyB0aGlzLl9sYXN0Q29kZSA6IHRoaXMuX2dldEJpdENvZGUoYSwgYm91bmRzKSxcclxuXHRcdCAgICBjb2RlQiA9IHRoaXMuX2dldEJpdENvZGUoYiwgYm91bmRzKSxcclxuXHJcblx0XHQgICAgY29kZU91dCwgcCwgbmV3Q29kZTtcclxuXHJcblx0XHQvLyBzYXZlIDJuZCBjb2RlIHRvIGF2b2lkIGNhbGN1bGF0aW5nIGl0IG9uIHRoZSBuZXh0IHNlZ21lbnRcclxuXHRcdHRoaXMuX2xhc3RDb2RlID0gY29kZUI7XHJcblxyXG5cdFx0d2hpbGUgKHRydWUpIHtcclxuXHRcdFx0Ly8gaWYgYSxiIGlzIGluc2lkZSB0aGUgY2xpcCB3aW5kb3cgKHRyaXZpYWwgYWNjZXB0KVxyXG5cdFx0XHRpZiAoIShjb2RlQSB8IGNvZGVCKSkge1xyXG5cdFx0XHRcdHJldHVybiBbYSwgYl07XHJcblx0XHRcdC8vIGlmIGEsYiBpcyBvdXRzaWRlIHRoZSBjbGlwIHdpbmRvdyAodHJpdmlhbCByZWplY3QpXHJcblx0XHRcdH0gZWxzZSBpZiAoY29kZUEgJiBjb2RlQikge1xyXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdFx0Ly8gb3RoZXIgY2FzZXNcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRjb2RlT3V0ID0gY29kZUEgfHwgY29kZUI7XHJcblx0XHRcdFx0cCA9IHRoaXMuX2dldEVkZ2VJbnRlcnNlY3Rpb24oYSwgYiwgY29kZU91dCwgYm91bmRzKTtcclxuXHRcdFx0XHRuZXdDb2RlID0gdGhpcy5fZ2V0Qml0Q29kZShwLCBib3VuZHMpO1xyXG5cclxuXHRcdFx0XHRpZiAoY29kZU91dCA9PT0gY29kZUEpIHtcclxuXHRcdFx0XHRcdGEgPSBwO1xyXG5cdFx0XHRcdFx0Y29kZUEgPSBuZXdDb2RlO1xyXG5cdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRiID0gcDtcclxuXHRcdFx0XHRcdGNvZGVCID0gbmV3Q29kZTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfZ2V0RWRnZUludGVyc2VjdGlvbjogZnVuY3Rpb24gKGEsIGIsIGNvZGUsIGJvdW5kcykge1xyXG5cdFx0dmFyIGR4ID0gYi54IC0gYS54LFxyXG5cdFx0ICAgIGR5ID0gYi55IC0gYS55LFxyXG5cdFx0ICAgIG1pbiA9IGJvdW5kcy5taW4sXHJcblx0XHQgICAgbWF4ID0gYm91bmRzLm1heDtcclxuXHJcblx0XHRpZiAoY29kZSAmIDgpIHsgLy8gdG9wXHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChhLnggKyBkeCAqIChtYXgueSAtIGEueSkgLyBkeSwgbWF4LnkpO1xyXG5cdFx0fSBlbHNlIGlmIChjb2RlICYgNCkgeyAvLyBib3R0b21cclxuXHRcdFx0cmV0dXJuIG5ldyBMLlBvaW50KGEueCArIGR4ICogKG1pbi55IC0gYS55KSAvIGR5LCBtaW4ueSk7XHJcblx0XHR9IGVsc2UgaWYgKGNvZGUgJiAyKSB7IC8vIHJpZ2h0XHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChtYXgueCwgYS55ICsgZHkgKiAobWF4LnggLSBhLngpIC8gZHgpO1xyXG5cdFx0fSBlbHNlIGlmIChjb2RlICYgMSkgeyAvLyBsZWZ0XHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChtaW4ueCwgYS55ICsgZHkgKiAobWluLnggLSBhLngpIC8gZHgpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9nZXRCaXRDb2RlOiBmdW5jdGlvbiAoLypQb2ludCovIHAsIGJvdW5kcykge1xyXG5cdFx0dmFyIGNvZGUgPSAwO1xyXG5cclxuXHRcdGlmIChwLnggPCBib3VuZHMubWluLngpIHsgLy8gbGVmdFxyXG5cdFx0XHRjb2RlIHw9IDE7XHJcblx0XHR9IGVsc2UgaWYgKHAueCA+IGJvdW5kcy5tYXgueCkgeyAvLyByaWdodFxyXG5cdFx0XHRjb2RlIHw9IDI7XHJcblx0XHR9XHJcblx0XHRpZiAocC55IDwgYm91bmRzLm1pbi55KSB7IC8vIGJvdHRvbVxyXG5cdFx0XHRjb2RlIHw9IDQ7XHJcblx0XHR9IGVsc2UgaWYgKHAueSA+IGJvdW5kcy5tYXgueSkgeyAvLyB0b3BcclxuXHRcdFx0Y29kZSB8PSA4O1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBjb2RlO1xyXG5cdH0sXHJcblxyXG5cdC8vIHNxdWFyZSBkaXN0YW5jZSAodG8gYXZvaWQgdW5uZWNlc3NhcnkgTWF0aC5zcXJ0IGNhbGxzKVxyXG5cdF9zcURpc3Q6IGZ1bmN0aW9uIChwMSwgcDIpIHtcclxuXHRcdHZhciBkeCA9IHAyLnggLSBwMS54LFxyXG5cdFx0ICAgIGR5ID0gcDIueSAtIHAxLnk7XHJcblx0XHRyZXR1cm4gZHggKiBkeCArIGR5ICogZHk7XHJcblx0fSxcclxuXHJcblx0Ly8gcmV0dXJuIGNsb3Nlc3QgcG9pbnQgb24gc2VnbWVudCBvciBkaXN0YW5jZSB0byB0aGF0IHBvaW50XHJcblx0X3NxQ2xvc2VzdFBvaW50T25TZWdtZW50OiBmdW5jdGlvbiAocCwgcDEsIHAyLCBzcURpc3QpIHtcclxuXHRcdHZhciB4ID0gcDEueCxcclxuXHRcdCAgICB5ID0gcDEueSxcclxuXHRcdCAgICBkeCA9IHAyLnggLSB4LFxyXG5cdFx0ICAgIGR5ID0gcDIueSAtIHksXHJcblx0XHQgICAgZG90ID0gZHggKiBkeCArIGR5ICogZHksXHJcblx0XHQgICAgdDtcclxuXHJcblx0XHRpZiAoZG90ID4gMCkge1xyXG5cdFx0XHR0ID0gKChwLnggLSB4KSAqIGR4ICsgKHAueSAtIHkpICogZHkpIC8gZG90O1xyXG5cclxuXHRcdFx0aWYgKHQgPiAxKSB7XHJcblx0XHRcdFx0eCA9IHAyLng7XHJcblx0XHRcdFx0eSA9IHAyLnk7XHJcblx0XHRcdH0gZWxzZSBpZiAodCA+IDApIHtcclxuXHRcdFx0XHR4ICs9IGR4ICogdDtcclxuXHRcdFx0XHR5ICs9IGR5ICogdDtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGR4ID0gcC54IC0geDtcclxuXHRcdGR5ID0gcC55IC0geTtcclxuXHJcblx0XHRyZXR1cm4gc3FEaXN0ID8gZHggKiBkeCArIGR5ICogZHkgOiBuZXcgTC5Qb2ludCh4LCB5KTtcclxuXHR9XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLlBvbHlsaW5lIGlzIHVzZWQgdG8gZGlzcGxheSBwb2x5bGluZXMgb24gYSBtYXAuXHJcbiAqL1xyXG5cclxuTC5Qb2x5bGluZSA9IEwuUGF0aC5leHRlbmQoe1xyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRsbmdzLCBvcHRpb25zKSB7XHJcblx0XHRMLlBhdGgucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcclxuXHJcblx0XHR0aGlzLl9sYXRsbmdzID0gdGhpcy5fY29udmVydExhdExuZ3MobGF0bG5ncyk7XHJcblx0fSxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0Ly8gaG93IG11Y2ggdG8gc2ltcGxpZnkgdGhlIHBvbHlsaW5lIG9uIGVhY2ggem9vbSBsZXZlbFxyXG5cdFx0Ly8gbW9yZSA9IGJldHRlciBwZXJmb3JtYW5jZSBhbmQgc21vb3RoZXIgbG9vaywgbGVzcyA9IG1vcmUgYWNjdXJhdGVcclxuXHRcdHNtb290aEZhY3RvcjogMS4wLFxyXG5cdFx0bm9DbGlwOiBmYWxzZVxyXG5cdH0sXHJcblxyXG5cdHByb2plY3RMYXRsbmdzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9vcmlnaW5hbFBvaW50cyA9IFtdO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLl9sYXRsbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHRoaXMuX29yaWdpbmFsUG9pbnRzW2ldID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9sYXRsbmdzW2ldKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRnZXRQYXRoU3RyaW5nOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuID0gdGhpcy5fcGFydHMubGVuZ3RoLCBzdHIgPSAnJzsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHN0ciArPSB0aGlzLl9nZXRQYXRoUGFydFN0cih0aGlzLl9wYXJ0c1tpXSk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gc3RyO1xyXG5cdH0sXHJcblxyXG5cdGdldExhdExuZ3M6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9sYXRsbmdzO1xyXG5cdH0sXHJcblxyXG5cdHNldExhdExuZ3M6IGZ1bmN0aW9uIChsYXRsbmdzKSB7XHJcblx0XHR0aGlzLl9sYXRsbmdzID0gdGhpcy5fY29udmVydExhdExuZ3MobGF0bG5ncyk7XHJcblx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHR9LFxyXG5cclxuXHRhZGRMYXRMbmc6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdHRoaXMuX2xhdGxuZ3MucHVzaChMLmxhdExuZyhsYXRsbmcpKTtcclxuXHRcdHJldHVybiB0aGlzLnJlZHJhdygpO1xyXG5cdH0sXHJcblxyXG5cdHNwbGljZUxhdExuZ3M6IGZ1bmN0aW9uICgpIHsgLy8gKE51bWJlciBpbmRleCwgTnVtYmVyIGhvd01hbnkpXHJcblx0XHR2YXIgcmVtb3ZlZCA9IFtdLnNwbGljZS5hcHBseSh0aGlzLl9sYXRsbmdzLCBhcmd1bWVudHMpO1xyXG5cdFx0dGhpcy5fY29udmVydExhdExuZ3ModGhpcy5fbGF0bG5ncywgdHJ1ZSk7XHJcblx0XHR0aGlzLnJlZHJhdygpO1xyXG5cdFx0cmV0dXJuIHJlbW92ZWQ7XHJcblx0fSxcclxuXHJcblx0Y2xvc2VzdExheWVyUG9pbnQ6IGZ1bmN0aW9uIChwKSB7XHJcblx0XHR2YXIgbWluRGlzdGFuY2UgPSBJbmZpbml0eSwgcGFydHMgPSB0aGlzLl9wYXJ0cywgcDEsIHAyLCBtaW5Qb2ludCA9IG51bGw7XHJcblxyXG5cdFx0Zm9yICh2YXIgaiA9IDAsIGpMZW4gPSBwYXJ0cy5sZW5ndGg7IGogPCBqTGVuOyBqKyspIHtcclxuXHRcdFx0dmFyIHBvaW50cyA9IHBhcnRzW2pdO1xyXG5cdFx0XHRmb3IgKHZhciBpID0gMSwgbGVuID0gcG9pbnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0cDEgPSBwb2ludHNbaSAtIDFdO1xyXG5cdFx0XHRcdHAyID0gcG9pbnRzW2ldO1xyXG5cdFx0XHRcdHZhciBzcURpc3QgPSBMLkxpbmVVdGlsLl9zcUNsb3Nlc3RQb2ludE9uU2VnbWVudChwLCBwMSwgcDIsIHRydWUpO1xyXG5cdFx0XHRcdGlmIChzcURpc3QgPCBtaW5EaXN0YW5jZSkge1xyXG5cdFx0XHRcdFx0bWluRGlzdGFuY2UgPSBzcURpc3Q7XHJcblx0XHRcdFx0XHRtaW5Qb2ludCA9IEwuTGluZVV0aWwuX3NxQ2xvc2VzdFBvaW50T25TZWdtZW50KHAsIHAxLCBwMik7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRpZiAobWluUG9pbnQpIHtcclxuXHRcdFx0bWluUG9pbnQuZGlzdGFuY2UgPSBNYXRoLnNxcnQobWluRGlzdGFuY2UpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIG1pblBvaW50O1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdW5kczogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZ0JvdW5kcyh0aGlzLmdldExhdExuZ3MoKSk7XHJcblx0fSxcclxuXHJcblx0X2NvbnZlcnRMYXRMbmdzOiBmdW5jdGlvbiAobGF0bG5ncywgb3ZlcndyaXRlKSB7XHJcblx0XHR2YXIgaSwgbGVuLCB0YXJnZXQgPSBvdmVyd3JpdGUgPyBsYXRsbmdzIDogW107XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gbGF0bG5ncy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRpZiAoTC5VdGlsLmlzQXJyYXkobGF0bG5nc1tpXSkgJiYgdHlwZW9mIGxhdGxuZ3NbaV1bMF0gIT09ICdudW1iZXInKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRhcmdldFtpXSA9IEwubGF0TG5nKGxhdGxuZ3NbaV0pO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRhcmdldDtcclxuXHR9LFxyXG5cclxuXHRfaW5pdEV2ZW50czogZnVuY3Rpb24gKCkge1xyXG5cdFx0TC5QYXRoLnByb3RvdHlwZS5faW5pdEV2ZW50cy5jYWxsKHRoaXMpO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRQYXRoUGFydFN0cjogZnVuY3Rpb24gKHBvaW50cykge1xyXG5cdFx0dmFyIHJvdW5kID0gTC5QYXRoLlZNTDtcclxuXHJcblx0XHRmb3IgKHZhciBqID0gMCwgbGVuMiA9IHBvaW50cy5sZW5ndGgsIHN0ciA9ICcnLCBwOyBqIDwgbGVuMjsgaisrKSB7XHJcblx0XHRcdHAgPSBwb2ludHNbal07XHJcblx0XHRcdGlmIChyb3VuZCkge1xyXG5cdFx0XHRcdHAuX3JvdW5kKCk7XHJcblx0XHRcdH1cclxuXHRcdFx0c3RyICs9IChqID8gJ0wnIDogJ00nKSArIHAueCArICcgJyArIHAueTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBzdHI7XHJcblx0fSxcclxuXHJcblx0X2NsaXBQb2ludHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwb2ludHMgPSB0aGlzLl9vcmlnaW5hbFBvaW50cyxcclxuXHRcdCAgICBsZW4gPSBwb2ludHMubGVuZ3RoLFxyXG5cdFx0ICAgIGksIGssIHNlZ21lbnQ7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5ub0NsaXApIHtcclxuXHRcdFx0dGhpcy5fcGFydHMgPSBbcG9pbnRzXTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhcnRzID0gW107XHJcblxyXG5cdFx0dmFyIHBhcnRzID0gdGhpcy5fcGFydHMsXHJcblx0XHQgICAgdnAgPSB0aGlzLl9tYXAuX3BhdGhWaWV3cG9ydCxcclxuXHRcdCAgICBsdSA9IEwuTGluZVV0aWw7XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgayA9IDA7IGkgPCBsZW4gLSAxOyBpKyspIHtcclxuXHRcdFx0c2VnbWVudCA9IGx1LmNsaXBTZWdtZW50KHBvaW50c1tpXSwgcG9pbnRzW2kgKyAxXSwgdnAsIGkpO1xyXG5cdFx0XHRpZiAoIXNlZ21lbnQpIHtcclxuXHRcdFx0XHRjb250aW51ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cGFydHNba10gPSBwYXJ0c1trXSB8fCBbXTtcclxuXHRcdFx0cGFydHNba10ucHVzaChzZWdtZW50WzBdKTtcclxuXHJcblx0XHRcdC8vIGlmIHNlZ21lbnQgZ29lcyBvdXQgb2Ygc2NyZWVuLCBvciBpdCdzIHRoZSBsYXN0IG9uZSwgaXQncyB0aGUgZW5kIG9mIHRoZSBsaW5lIHBhcnRcclxuXHRcdFx0aWYgKChzZWdtZW50WzFdICE9PSBwb2ludHNbaSArIDFdKSB8fCAoaSA9PT0gbGVuIC0gMikpIHtcclxuXHRcdFx0XHRwYXJ0c1trXS5wdXNoKHNlZ21lbnRbMV0pO1xyXG5cdFx0XHRcdGsrKztcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIHNpbXBsaWZ5IGVhY2ggY2xpcHBlZCBwYXJ0IG9mIHRoZSBwb2x5bGluZVxyXG5cdF9zaW1wbGlmeVBvaW50czogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBhcnRzID0gdGhpcy5fcGFydHMsXHJcblx0XHQgICAgbHUgPSBMLkxpbmVVdGlsO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSBwYXJ0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRwYXJ0c1tpXSA9IGx1LnNpbXBsaWZ5KHBhcnRzW2ldLCB0aGlzLm9wdGlvbnMuc21vb3RoRmFjdG9yKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlUGF0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dGhpcy5fY2xpcFBvaW50cygpO1xyXG5cdFx0dGhpcy5fc2ltcGxpZnlQb2ludHMoKTtcclxuXHJcblx0XHRMLlBhdGgucHJvdG90eXBlLl91cGRhdGVQYXRoLmNhbGwodGhpcyk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwucG9seWxpbmUgPSBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5Qb2x5bGluZShsYXRsbmdzLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuUG9seVV0aWwgY29udGFpbnMgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIHBvbHlnb25zIChjbGlwcGluZywgZXRjLikuXHJcbiAqL1xyXG5cclxuLypqc2hpbnQgYml0d2lzZTpmYWxzZSAqLyAvLyBhbGxvdyBiaXR3aXNlIG9wZXJhdGlvbnMgaGVyZVxyXG5cclxuTC5Qb2x5VXRpbCA9IHt9O1xyXG5cclxuLypcclxuICogU3V0aGVybGFuZC1Ib2RnZW1hbiBwb2x5Z29uIGNsaXBwaW5nIGFsZ29yaXRobS5cclxuICogVXNlZCB0byBhdm9pZCByZW5kZXJpbmcgcGFydHMgb2YgYSBwb2x5Z29uIHRoYXQgYXJlIG5vdCBjdXJyZW50bHkgdmlzaWJsZS5cclxuICovXHJcbkwuUG9seVV0aWwuY2xpcFBvbHlnb24gPSBmdW5jdGlvbiAocG9pbnRzLCBib3VuZHMpIHtcclxuXHR2YXIgY2xpcHBlZFBvaW50cyxcclxuXHQgICAgZWRnZXMgPSBbMSwgNCwgMiwgOF0sXHJcblx0ICAgIGksIGosIGssXHJcblx0ICAgIGEsIGIsXHJcblx0ICAgIGxlbiwgZWRnZSwgcCxcclxuXHQgICAgbHUgPSBMLkxpbmVVdGlsO1xyXG5cclxuXHRmb3IgKGkgPSAwLCBsZW4gPSBwb2ludHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdHBvaW50c1tpXS5fY29kZSA9IGx1Ll9nZXRCaXRDb2RlKHBvaW50c1tpXSwgYm91bmRzKTtcclxuXHR9XHJcblxyXG5cdC8vIGZvciBlYWNoIGVkZ2UgKGxlZnQsIGJvdHRvbSwgcmlnaHQsIHRvcClcclxuXHRmb3IgKGsgPSAwOyBrIDwgNDsgaysrKSB7XHJcblx0XHRlZGdlID0gZWRnZXNba107XHJcblx0XHRjbGlwcGVkUG9pbnRzID0gW107XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gcG9pbnRzLmxlbmd0aCwgaiA9IGxlbiAtIDE7IGkgPCBsZW47IGogPSBpKyspIHtcclxuXHRcdFx0YSA9IHBvaW50c1tpXTtcclxuXHRcdFx0YiA9IHBvaW50c1tqXTtcclxuXHJcblx0XHRcdC8vIGlmIGEgaXMgaW5zaWRlIHRoZSBjbGlwIHdpbmRvd1xyXG5cdFx0XHRpZiAoIShhLl9jb2RlICYgZWRnZSkpIHtcclxuXHRcdFx0XHQvLyBpZiBiIGlzIG91dHNpZGUgdGhlIGNsaXAgd2luZG93IChhLT5iIGdvZXMgb3V0IG9mIHNjcmVlbilcclxuXHRcdFx0XHRpZiAoYi5fY29kZSAmIGVkZ2UpIHtcclxuXHRcdFx0XHRcdHAgPSBsdS5fZ2V0RWRnZUludGVyc2VjdGlvbihiLCBhLCBlZGdlLCBib3VuZHMpO1xyXG5cdFx0XHRcdFx0cC5fY29kZSA9IGx1Ll9nZXRCaXRDb2RlKHAsIGJvdW5kcyk7XHJcblx0XHRcdFx0XHRjbGlwcGVkUG9pbnRzLnB1c2gocCk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGNsaXBwZWRQb2ludHMucHVzaChhKTtcclxuXHJcblx0XHRcdC8vIGVsc2UgaWYgYiBpcyBpbnNpZGUgdGhlIGNsaXAgd2luZG93IChhLT5iIGVudGVycyB0aGUgc2NyZWVuKVxyXG5cdFx0XHR9IGVsc2UgaWYgKCEoYi5fY29kZSAmIGVkZ2UpKSB7XHJcblx0XHRcdFx0cCA9IGx1Ll9nZXRFZGdlSW50ZXJzZWN0aW9uKGIsIGEsIGVkZ2UsIGJvdW5kcyk7XHJcblx0XHRcdFx0cC5fY29kZSA9IGx1Ll9nZXRCaXRDb2RlKHAsIGJvdW5kcyk7XHJcblx0XHRcdFx0Y2xpcHBlZFBvaW50cy5wdXNoKHApO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRwb2ludHMgPSBjbGlwcGVkUG9pbnRzO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHBvaW50cztcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuUG9seWdvbiBpcyB1c2VkIHRvIGRpc3BsYXkgcG9seWdvbnMgb24gYSBtYXAuXHJcbiAqL1xyXG5cclxuTC5Qb2x5Z29uID0gTC5Qb2x5bGluZS5leHRlbmQoe1xyXG5cdG9wdGlvbnM6IHtcclxuXHRcdGZpbGw6IHRydWVcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0TC5Qb2x5bGluZS5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIGxhdGxuZ3MsIG9wdGlvbnMpO1xyXG5cdFx0dGhpcy5faW5pdFdpdGhIb2xlcyhsYXRsbmdzKTtcclxuXHR9LFxyXG5cclxuXHRfaW5pdFdpdGhIb2xlczogZnVuY3Rpb24gKGxhdGxuZ3MpIHtcclxuXHRcdHZhciBpLCBsZW4sIGhvbGU7XHJcblx0XHRpZiAobGF0bG5ncyAmJiBMLlV0aWwuaXNBcnJheShsYXRsbmdzWzBdKSAmJiAodHlwZW9mIGxhdGxuZ3NbMF1bMF0gIT09ICdudW1iZXInKSkge1xyXG5cdFx0XHR0aGlzLl9sYXRsbmdzID0gdGhpcy5fY29udmVydExhdExuZ3MobGF0bG5nc1swXSk7XHJcblx0XHRcdHRoaXMuX2hvbGVzID0gbGF0bG5ncy5zbGljZSgxKTtcclxuXHJcblx0XHRcdGZvciAoaSA9IDAsIGxlbiA9IHRoaXMuX2hvbGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0aG9sZSA9IHRoaXMuX2hvbGVzW2ldID0gdGhpcy5fY29udmVydExhdExuZ3ModGhpcy5faG9sZXNbaV0pO1xyXG5cdFx0XHRcdGlmIChob2xlWzBdLmVxdWFscyhob2xlW2hvbGUubGVuZ3RoIC0gMV0pKSB7XHJcblx0XHRcdFx0XHRob2xlLnBvcCgpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdC8vIGZpbHRlciBvdXQgbGFzdCBwb2ludCBpZiBpdHMgZXF1YWwgdG8gdGhlIGZpcnN0IG9uZVxyXG5cdFx0bGF0bG5ncyA9IHRoaXMuX2xhdGxuZ3M7XHJcblxyXG5cdFx0aWYgKGxhdGxuZ3MubGVuZ3RoID49IDIgJiYgbGF0bG5nc1swXS5lcXVhbHMobGF0bG5nc1tsYXRsbmdzLmxlbmd0aCAtIDFdKSkge1xyXG5cdFx0XHRsYXRsbmdzLnBvcCgpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHByb2plY3RMYXRsbmdzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRMLlBvbHlsaW5lLnByb3RvdHlwZS5wcm9qZWN0TGF0bG5ncy5jYWxsKHRoaXMpO1xyXG5cclxuXHRcdC8vIHByb2plY3QgcG9seWdvbiBob2xlcyBwb2ludHNcclxuXHRcdC8vIFRPRE8gbW92ZSB0aGlzIGxvZ2ljIHRvIFBvbHlsaW5lIHRvIGdldCByaWQgb2YgZHVwbGljYXRpb25cclxuXHRcdHRoaXMuX2hvbGVQb2ludHMgPSBbXTtcclxuXHJcblx0XHRpZiAoIXRoaXMuX2hvbGVzKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBpLCBqLCBsZW4sIGxlbjI7XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGhpcy5faG9sZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0dGhpcy5faG9sZVBvaW50c1tpXSA9IFtdO1xyXG5cclxuXHRcdFx0Zm9yIChqID0gMCwgbGVuMiA9IHRoaXMuX2hvbGVzW2ldLmxlbmd0aDsgaiA8IGxlbjI7IGorKykge1xyXG5cdFx0XHRcdHRoaXMuX2hvbGVQb2ludHNbaV1bal0gPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KHRoaXMuX2hvbGVzW2ldW2pdKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHNldExhdExuZ3M6IGZ1bmN0aW9uIChsYXRsbmdzKSB7XHJcblx0XHRpZiAobGF0bG5ncyAmJiBMLlV0aWwuaXNBcnJheShsYXRsbmdzWzBdKSAmJiAodHlwZW9mIGxhdGxuZ3NbMF1bMF0gIT09ICdudW1iZXInKSkge1xyXG5cdFx0XHR0aGlzLl9pbml0V2l0aEhvbGVzKGxhdGxuZ3MpO1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHJldHVybiBMLlBvbHlsaW5lLnByb3RvdHlwZS5zZXRMYXRMbmdzLmNhbGwodGhpcywgbGF0bG5ncyk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2NsaXBQb2ludHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwb2ludHMgPSB0aGlzLl9vcmlnaW5hbFBvaW50cyxcclxuXHRcdCAgICBuZXdQYXJ0cyA9IFtdO1xyXG5cclxuXHRcdHRoaXMuX3BhcnRzID0gW3BvaW50c10uY29uY2F0KHRoaXMuX2hvbGVQb2ludHMpO1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMubm9DbGlwKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLl9wYXJ0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHR2YXIgY2xpcHBlZCA9IEwuUG9seVV0aWwuY2xpcFBvbHlnb24odGhpcy5fcGFydHNbaV0sIHRoaXMuX21hcC5fcGF0aFZpZXdwb3J0KTtcclxuXHRcdFx0aWYgKGNsaXBwZWQubGVuZ3RoKSB7XHJcblx0XHRcdFx0bmV3UGFydHMucHVzaChjbGlwcGVkKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhcnRzID0gbmV3UGFydHM7XHJcblx0fSxcclxuXHJcblx0X2dldFBhdGhQYXJ0U3RyOiBmdW5jdGlvbiAocG9pbnRzKSB7XHJcblx0XHR2YXIgc3RyID0gTC5Qb2x5bGluZS5wcm90b3R5cGUuX2dldFBhdGhQYXJ0U3RyLmNhbGwodGhpcywgcG9pbnRzKTtcclxuXHRcdHJldHVybiBzdHIgKyAoTC5Ccm93c2VyLnN2ZyA/ICd6JyA6ICd4Jyk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwucG9seWdvbiA9IGZ1bmN0aW9uIChsYXRsbmdzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLlBvbHlnb24obGF0bG5ncywgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBDb250YWlucyBMLk11bHRpUG9seWxpbmUgYW5kIEwuTXVsdGlQb2x5Z29uIGxheWVycy5cclxuICovXHJcblxyXG4oZnVuY3Rpb24gKCkge1xyXG5cdGZ1bmN0aW9uIGNyZWF0ZU11bHRpKEtsYXNzKSB7XHJcblxyXG5cdFx0cmV0dXJuIEwuRmVhdHVyZUdyb3VwLmV4dGVuZCh7XHJcblxyXG5cdFx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0XHRcdHRoaXMuX2xheWVycyA9IHt9O1xyXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMgPSBvcHRpb25zO1xyXG5cdFx0XHRcdHRoaXMuc2V0TGF0TG5ncyhsYXRsbmdzKTtcclxuXHRcdFx0fSxcclxuXHJcblx0XHRcdHNldExhdExuZ3M6IGZ1bmN0aW9uIChsYXRsbmdzKSB7XHJcblx0XHRcdFx0dmFyIGkgPSAwLFxyXG5cdFx0XHRcdCAgICBsZW4gPSBsYXRsbmdzLmxlbmd0aDtcclxuXHJcblx0XHRcdFx0dGhpcy5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRcdFx0XHRpZiAoaSA8IGxlbikge1xyXG5cdFx0XHRcdFx0XHRsYXllci5zZXRMYXRMbmdzKGxhdGxuZ3NbaSsrXSk7XHJcblx0XHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0XHR0aGlzLnJlbW92ZUxheWVyKGxheWVyKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9LCB0aGlzKTtcclxuXHJcblx0XHRcdFx0d2hpbGUgKGkgPCBsZW4pIHtcclxuXHRcdFx0XHRcdHRoaXMuYWRkTGF5ZXIobmV3IEtsYXNzKGxhdGxuZ3NbaSsrXSwgdGhpcy5fb3B0aW9ucykpO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHRcdH0sXHJcblxyXG5cdFx0XHRnZXRMYXRMbmdzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdFx0dmFyIGxhdGxuZ3MgPSBbXTtcclxuXHJcblx0XHRcdFx0dGhpcy5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRcdFx0XHRsYXRsbmdzLnB1c2gobGF5ZXIuZ2V0TGF0TG5ncygpKTtcclxuXHRcdFx0XHR9KTtcclxuXHJcblx0XHRcdFx0cmV0dXJuIGxhdGxuZ3M7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0TC5NdWx0aVBvbHlsaW5lID0gY3JlYXRlTXVsdGkoTC5Qb2x5bGluZSk7XHJcblx0TC5NdWx0aVBvbHlnb24gPSBjcmVhdGVNdWx0aShMLlBvbHlnb24pO1xyXG5cclxuXHRMLm11bHRpUG9seWxpbmUgPSBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0cmV0dXJuIG5ldyBMLk11bHRpUG9seWxpbmUobGF0bG5ncywgb3B0aW9ucyk7XHJcblx0fTtcclxuXHJcblx0TC5tdWx0aVBvbHlnb24gPSBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0cmV0dXJuIG5ldyBMLk11bHRpUG9seWdvbihsYXRsbmdzLCBvcHRpb25zKTtcclxuXHR9O1xyXG59KCkpO1xyXG5cblxuLypcclxuICogTC5SZWN0YW5nbGUgZXh0ZW5kcyBQb2x5Z29uIGFuZCBjcmVhdGVzIGEgcmVjdGFuZ2xlIHdoZW4gcGFzc2VkIGEgTGF0TG5nQm91bmRzIG9iamVjdC5cclxuICovXHJcblxyXG5MLlJlY3RhbmdsZSA9IEwuUG9seWdvbi5leHRlbmQoe1xyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRMbmdCb3VuZHMsIG9wdGlvbnMpIHtcclxuXHRcdEwuUG9seWdvbi5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIHRoaXMuX2JvdW5kc1RvTGF0TG5ncyhsYXRMbmdCb3VuZHMpLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRzZXRCb3VuZHM6IGZ1bmN0aW9uIChsYXRMbmdCb3VuZHMpIHtcclxuXHRcdHRoaXMuc2V0TGF0TG5ncyh0aGlzLl9ib3VuZHNUb0xhdExuZ3MobGF0TG5nQm91bmRzKSk7XHJcblx0fSxcclxuXHJcblx0X2JvdW5kc1RvTGF0TG5nczogZnVuY3Rpb24gKGxhdExuZ0JvdW5kcykge1xyXG5cdFx0bGF0TG5nQm91bmRzID0gTC5sYXRMbmdCb3VuZHMobGF0TG5nQm91bmRzKTtcclxuXHRcdHJldHVybiBbXHJcblx0XHRcdGxhdExuZ0JvdW5kcy5nZXRTb3V0aFdlc3QoKSxcclxuXHRcdFx0bGF0TG5nQm91bmRzLmdldE5vcnRoV2VzdCgpLFxyXG5cdFx0XHRsYXRMbmdCb3VuZHMuZ2V0Tm9ydGhFYXN0KCksXHJcblx0XHRcdGxhdExuZ0JvdW5kcy5nZXRTb3V0aEVhc3QoKVxyXG5cdFx0XTtcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5yZWN0YW5nbGUgPSBmdW5jdGlvbiAobGF0TG5nQm91bmRzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLlJlY3RhbmdsZShsYXRMbmdCb3VuZHMsIG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5DaXJjbGUgaXMgYSBjaXJjbGUgb3ZlcmxheSAod2l0aCBhIGNlcnRhaW4gcmFkaXVzIGluIG1ldGVycykuXHJcbiAqL1xyXG5cclxuTC5DaXJjbGUgPSBMLlBhdGguZXh0ZW5kKHtcclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCByYWRpdXMsIG9wdGlvbnMpIHtcclxuXHRcdEwuUGF0aC5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XHJcblx0XHR0aGlzLl9tUmFkaXVzID0gcmFkaXVzO1xyXG5cdH0sXHJcblxyXG5cdG9wdGlvbnM6IHtcclxuXHRcdGZpbGw6IHRydWVcclxuXHR9LFxyXG5cclxuXHRzZXRMYXRMbmc6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XHJcblx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHR9LFxyXG5cclxuXHRzZXRSYWRpdXM6IGZ1bmN0aW9uIChyYWRpdXMpIHtcclxuXHRcdHRoaXMuX21SYWRpdXMgPSByYWRpdXM7XHJcblx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHR9LFxyXG5cclxuXHRwcm9qZWN0TGF0bG5nczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxuZ1JhZGl1cyA9IHRoaXMuX2dldExuZ1JhZGl1cygpLFxyXG5cdFx0ICAgIGxhdGxuZyA9IHRoaXMuX2xhdGxuZyxcclxuXHRcdCAgICBwb2ludExlZnQgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KFtsYXRsbmcubGF0LCBsYXRsbmcubG5nIC0gbG5nUmFkaXVzXSk7XHJcblxyXG5cdFx0dGhpcy5fcG9pbnQgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KGxhdGxuZyk7XHJcblx0XHR0aGlzLl9yYWRpdXMgPSBNYXRoLm1heCh0aGlzLl9wb2ludC54IC0gcG9pbnRMZWZ0LngsIDEpO1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdW5kczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxuZ1JhZGl1cyA9IHRoaXMuX2dldExuZ1JhZGl1cygpLFxyXG5cdFx0ICAgIGxhdFJhZGl1cyA9ICh0aGlzLl9tUmFkaXVzIC8gNDAwNzUwMTcpICogMzYwLFxyXG5cdFx0ICAgIGxhdGxuZyA9IHRoaXMuX2xhdGxuZztcclxuXHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nQm91bmRzKFxyXG5cdFx0ICAgICAgICBbbGF0bG5nLmxhdCAtIGxhdFJhZGl1cywgbGF0bG5nLmxuZyAtIGxuZ1JhZGl1c10sXHJcblx0XHQgICAgICAgIFtsYXRsbmcubGF0ICsgbGF0UmFkaXVzLCBsYXRsbmcubG5nICsgbG5nUmFkaXVzXSk7XHJcblx0fSxcclxuXHJcblx0Z2V0TGF0TG5nOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbGF0bG5nO1xyXG5cdH0sXHJcblxyXG5cdGdldFBhdGhTdHJpbmc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwID0gdGhpcy5fcG9pbnQsXHJcblx0XHQgICAgciA9IHRoaXMuX3JhZGl1cztcclxuXHJcblx0XHRpZiAodGhpcy5fY2hlY2tJZkVtcHR5KCkpIHtcclxuXHRcdFx0cmV0dXJuICcnO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIuc3ZnKSB7XHJcblx0XHRcdHJldHVybiAnTScgKyBwLnggKyAnLCcgKyAocC55IC0gcikgK1xyXG5cdFx0XHQgICAgICAgJ0EnICsgciArICcsJyArIHIgKyAnLDAsMSwxLCcgK1xyXG5cdFx0XHQgICAgICAgKHAueCAtIDAuMSkgKyAnLCcgKyAocC55IC0gcikgKyAnIHonO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cC5fcm91bmQoKTtcclxuXHRcdFx0ciA9IE1hdGgucm91bmQocik7XHJcblx0XHRcdHJldHVybiAnQUwgJyArIHAueCArICcsJyArIHAueSArICcgJyArIHIgKyAnLCcgKyByICsgJyAwLCcgKyAoNjU1MzUgKiAzNjApO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGdldFJhZGl1czogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX21SYWRpdXM7XHJcblx0fSxcclxuXHJcblx0Ly8gVE9ETyBFYXJ0aCBoYXJkY29kZWQsIG1vdmUgaW50byBwcm9qZWN0aW9uIGNvZGUhXHJcblxyXG5cdF9nZXRMYXRSYWRpdXM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiAodGhpcy5fbVJhZGl1cyAvIDQwMDc1MDE3KSAqIDM2MDtcclxuXHR9LFxyXG5cclxuXHRfZ2V0TG5nUmFkaXVzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fZ2V0TGF0UmFkaXVzKCkgLyBNYXRoLmNvcyhMLkxhdExuZy5ERUdfVE9fUkFEICogdGhpcy5fbGF0bG5nLmxhdCk7XHJcblx0fSxcclxuXHJcblx0X2NoZWNrSWZFbXB0eTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHtcclxuXHRcdFx0cmV0dXJuIGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0dmFyIHZwID0gdGhpcy5fbWFwLl9wYXRoVmlld3BvcnQsXHJcblx0XHQgICAgciA9IHRoaXMuX3JhZGl1cyxcclxuXHRcdCAgICBwID0gdGhpcy5fcG9pbnQ7XHJcblxyXG5cdFx0cmV0dXJuIHAueCAtIHIgPiB2cC5tYXgueCB8fCBwLnkgLSByID4gdnAubWF4LnkgfHxcclxuXHRcdCAgICAgICBwLnggKyByIDwgdnAubWluLnggfHwgcC55ICsgciA8IHZwLm1pbi55O1xyXG5cdH1cclxufSk7XHJcblxyXG5MLmNpcmNsZSA9IGZ1bmN0aW9uIChsYXRsbmcsIHJhZGl1cywgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5DaXJjbGUobGF0bG5nLCByYWRpdXMsIG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5DaXJjbGVNYXJrZXIgaXMgYSBjaXJjbGUgb3ZlcmxheSB3aXRoIGEgcGVybWFuZW50IHBpeGVsIHJhZGl1cy5cclxuICovXHJcblxyXG5MLkNpcmNsZU1hcmtlciA9IEwuQ2lyY2xlLmV4dGVuZCh7XHJcblx0b3B0aW9uczoge1xyXG5cdFx0cmFkaXVzOiAxMCxcclxuXHRcdHdlaWdodDogMlxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRsbmcsIG9wdGlvbnMpIHtcclxuXHRcdEwuQ2lyY2xlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgbGF0bG5nLCBudWxsLCBvcHRpb25zKTtcclxuXHRcdHRoaXMuX3JhZGl1cyA9IHRoaXMub3B0aW9ucy5yYWRpdXM7XHJcblx0fSxcclxuXHJcblx0cHJvamVjdExhdGxuZ3M6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX3BvaW50ID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9sYXRsbmcpO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVTdHlsZSA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuQ2lyY2xlLnByb3RvdHlwZS5fdXBkYXRlU3R5bGUuY2FsbCh0aGlzKTtcclxuXHRcdHRoaXMuc2V0UmFkaXVzKHRoaXMub3B0aW9ucy5yYWRpdXMpO1xyXG5cdH0sXHJcblxyXG5cdHNldExhdExuZzogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0TC5DaXJjbGUucHJvdG90eXBlLnNldExhdExuZy5jYWxsKHRoaXMsIGxhdGxuZyk7XHJcblx0XHRpZiAodGhpcy5fcG9wdXAgJiYgdGhpcy5fcG9wdXAuX2lzT3Blbikge1xyXG5cdFx0XHR0aGlzLl9wb3B1cC5zZXRMYXRMbmcobGF0bG5nKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHNldFJhZGl1czogZnVuY3Rpb24gKHJhZGl1cykge1xyXG5cdFx0dGhpcy5vcHRpb25zLnJhZGl1cyA9IHRoaXMuX3JhZGl1cyA9IHJhZGl1cztcclxuXHRcdHJldHVybiB0aGlzLnJlZHJhdygpO1xyXG5cdH0sXHJcblxyXG5cdGdldFJhZGl1czogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3JhZGl1cztcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5jaXJjbGVNYXJrZXIgPSBmdW5jdGlvbiAobGF0bG5nLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkNpcmNsZU1hcmtlcihsYXRsbmcsIG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogRXh0ZW5kcyBMLlBvbHlsaW5lIHRvIGJlIGFibGUgdG8gbWFudWFsbHkgZGV0ZWN0IGNsaWNrcyBvbiBDYW52YXMtcmVuZGVyZWQgcG9seWxpbmVzLlxyXG4gKi9cclxuXHJcbkwuUG9seWxpbmUuaW5jbHVkZSghTC5QYXRoLkNBTlZBUyA/IHt9IDoge1xyXG5cdF9jb250YWluc1BvaW50OiBmdW5jdGlvbiAocCwgY2xvc2VkKSB7XHJcblx0XHR2YXIgaSwgaiwgaywgbGVuLCBsZW4yLCBkaXN0LCBwYXJ0LFxyXG5cdFx0ICAgIHcgPSB0aGlzLm9wdGlvbnMud2VpZ2h0IC8gMjtcclxuXHJcblx0XHRpZiAoTC5Ccm93c2VyLnRvdWNoKSB7XHJcblx0XHRcdHcgKz0gMTA7IC8vIHBvbHlsaW5lIGNsaWNrIHRvbGVyYW5jZSBvbiB0b3VjaCBkZXZpY2VzXHJcblx0XHR9XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGhpcy5fcGFydHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0cGFydCA9IHRoaXMuX3BhcnRzW2ldO1xyXG5cdFx0XHRmb3IgKGogPSAwLCBsZW4yID0gcGFydC5sZW5ndGgsIGsgPSBsZW4yIC0gMTsgaiA8IGxlbjI7IGsgPSBqKyspIHtcclxuXHRcdFx0XHRpZiAoIWNsb3NlZCAmJiAoaiA9PT0gMCkpIHtcclxuXHRcdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0ZGlzdCA9IEwuTGluZVV0aWwucG9pbnRUb1NlZ21lbnREaXN0YW5jZShwLCBwYXJ0W2tdLCBwYXJ0W2pdKTtcclxuXHJcblx0XHRcdFx0aWYgKGRpc3QgPD0gdykge1xyXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZmFsc2U7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIEV4dGVuZHMgTC5Qb2x5Z29uIHRvIGJlIGFibGUgdG8gbWFudWFsbHkgZGV0ZWN0IGNsaWNrcyBvbiBDYW52YXMtcmVuZGVyZWQgcG9seWdvbnMuXHJcbiAqL1xyXG5cclxuTC5Qb2x5Z29uLmluY2x1ZGUoIUwuUGF0aC5DQU5WQVMgPyB7fSA6IHtcclxuXHRfY29udGFpbnNQb2ludDogZnVuY3Rpb24gKHApIHtcclxuXHRcdHZhciBpbnNpZGUgPSBmYWxzZSxcclxuXHRcdCAgICBwYXJ0LCBwMSwgcDIsXHJcblx0XHQgICAgaSwgaiwgayxcclxuXHRcdCAgICBsZW4sIGxlbjI7XHJcblxyXG5cdFx0Ly8gVE9ETyBvcHRpbWl6YXRpb246IGNoZWNrIGlmIHdpdGhpbiBib3VuZHMgZmlyc3RcclxuXHJcblx0XHRpZiAoTC5Qb2x5bGluZS5wcm90b3R5cGUuX2NvbnRhaW5zUG9pbnQuY2FsbCh0aGlzLCBwLCB0cnVlKSkge1xyXG5cdFx0XHQvLyBjbGljayBvbiBwb2x5Z29uIGJvcmRlclxyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyByYXkgY2FzdGluZyBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBpZiBwb2ludCBpcyBpbiBwb2x5Z29uXHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGhpcy5fcGFydHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0cGFydCA9IHRoaXMuX3BhcnRzW2ldO1xyXG5cclxuXHRcdFx0Zm9yIChqID0gMCwgbGVuMiA9IHBhcnQubGVuZ3RoLCBrID0gbGVuMiAtIDE7IGogPCBsZW4yOyBrID0gaisrKSB7XHJcblx0XHRcdFx0cDEgPSBwYXJ0W2pdO1xyXG5cdFx0XHRcdHAyID0gcGFydFtrXTtcclxuXHJcblx0XHRcdFx0aWYgKCgocDEueSA+IHAueSkgIT09IChwMi55ID4gcC55KSkgJiZcclxuXHRcdFx0XHRcdFx0KHAueCA8IChwMi54IC0gcDEueCkgKiAocC55IC0gcDEueSkgLyAocDIueSAtIHAxLnkpICsgcDEueCkpIHtcclxuXHRcdFx0XHRcdGluc2lkZSA9ICFpbnNpZGU7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIGluc2lkZTtcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcclxuICogRXh0ZW5kcyBMLkNpcmNsZSB3aXRoIENhbnZhcy1zcGVjaWZpYyBjb2RlLlxyXG4gKi9cclxuXHJcbkwuQ2lyY2xlLmluY2x1ZGUoIUwuUGF0aC5DQU5WQVMgPyB7fSA6IHtcclxuXHRfZHJhd1BhdGg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwID0gdGhpcy5fcG9pbnQ7XHJcblx0XHR0aGlzLl9jdHguYmVnaW5QYXRoKCk7XHJcblx0XHR0aGlzLl9jdHguYXJjKHAueCwgcC55LCB0aGlzLl9yYWRpdXMsIDAsIE1hdGguUEkgKiAyLCBmYWxzZSk7XHJcblx0fSxcclxuXHJcblx0X2NvbnRhaW5zUG9pbnQ6IGZ1bmN0aW9uIChwKSB7XHJcblx0XHR2YXIgY2VudGVyID0gdGhpcy5fcG9pbnQsXHJcblx0XHQgICAgdzIgPSB0aGlzLm9wdGlvbnMuc3Ryb2tlID8gdGhpcy5vcHRpb25zLndlaWdodCAvIDIgOiAwO1xyXG5cclxuXHRcdHJldHVybiAocC5kaXN0YW5jZVRvKGNlbnRlcikgPD0gdGhpcy5fcmFkaXVzICsgdzIpO1xyXG5cdH1cclxufSk7XHJcblxuXG4vKlxuICogQ2lyY2xlTWFya2VyIGNhbnZhcyBzcGVjaWZpYyBkcmF3aW5nIHBhcnRzLlxuICovXG5cbkwuQ2lyY2xlTWFya2VyLmluY2x1ZGUoIUwuUGF0aC5DQU5WQVMgPyB7fSA6IHtcblx0X3VwZGF0ZVN0eWxlOiBmdW5jdGlvbiAoKSB7XG5cdFx0TC5QYXRoLnByb3RvdHlwZS5fdXBkYXRlU3R5bGUuY2FsbCh0aGlzKTtcblx0fVxufSk7XG5cblxuLypcclxuICogTC5HZW9KU09OIHR1cm5zIGFueSBHZW9KU09OIGRhdGEgaW50byBhIExlYWZsZXQgbGF5ZXIuXHJcbiAqL1xyXG5cclxuTC5HZW9KU09OID0gTC5GZWF0dXJlR3JvdXAuZXh0ZW5kKHtcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKGdlb2pzb24sIG9wdGlvbnMpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHJcblx0XHR0aGlzLl9sYXllcnMgPSB7fTtcclxuXHJcblx0XHRpZiAoZ2VvanNvbikge1xyXG5cdFx0XHR0aGlzLmFkZERhdGEoZ2VvanNvbik7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0YWRkRGF0YTogZnVuY3Rpb24gKGdlb2pzb24pIHtcclxuXHRcdHZhciBmZWF0dXJlcyA9IEwuVXRpbC5pc0FycmF5KGdlb2pzb24pID8gZ2VvanNvbiA6IGdlb2pzb24uZmVhdHVyZXMsXHJcblx0XHQgICAgaSwgbGVuLCBmZWF0dXJlO1xyXG5cclxuXHRcdGlmIChmZWF0dXJlcykge1xyXG5cdFx0XHRmb3IgKGkgPSAwLCBsZW4gPSBmZWF0dXJlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRcdC8vIE9ubHkgYWRkIHRoaXMgaWYgZ2VvbWV0cnkgb3IgZ2VvbWV0cmllcyBhcmUgc2V0IGFuZCBub3QgbnVsbFxyXG5cdFx0XHRcdGZlYXR1cmUgPSBmZWF0dXJlc1tpXTtcclxuXHRcdFx0XHRpZiAoZmVhdHVyZS5nZW9tZXRyaWVzIHx8IGZlYXR1cmUuZ2VvbWV0cnkgfHwgZmVhdHVyZS5mZWF0dXJlcyB8fCBmZWF0dXJlLmNvb3JkaW5hdGVzKSB7XHJcblx0XHRcdFx0XHR0aGlzLmFkZERhdGEoZmVhdHVyZXNbaV0pO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcclxuXHJcblx0XHRpZiAob3B0aW9ucy5maWx0ZXIgJiYgIW9wdGlvbnMuZmlsdGVyKGdlb2pzb24pKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIoZ2VvanNvbiwgb3B0aW9ucy5wb2ludFRvTGF5ZXIsIG9wdGlvbnMuY29vcmRzVG9MYXRMbmcsIG9wdGlvbnMpO1xyXG5cdFx0bGF5ZXIuZmVhdHVyZSA9IEwuR2VvSlNPTi5hc0ZlYXR1cmUoZ2VvanNvbik7XHJcblxyXG5cdFx0bGF5ZXIuZGVmYXVsdE9wdGlvbnMgPSBsYXllci5vcHRpb25zO1xyXG5cdFx0dGhpcy5yZXNldFN0eWxlKGxheWVyKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5vbkVhY2hGZWF0dXJlKSB7XHJcblx0XHRcdG9wdGlvbnMub25FYWNoRmVhdHVyZShnZW9qc29uLCBsYXllcik7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuYWRkTGF5ZXIobGF5ZXIpO1xyXG5cdH0sXHJcblxyXG5cdHJlc2V0U3R5bGU6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIHN0eWxlID0gdGhpcy5vcHRpb25zLnN0eWxlO1xyXG5cdFx0aWYgKHN0eWxlKSB7XHJcblx0XHRcdC8vIHJlc2V0IGFueSBjdXN0b20gc3R5bGVzXHJcblx0XHRcdEwuVXRpbC5leHRlbmQobGF5ZXIub3B0aW9ucywgbGF5ZXIuZGVmYXVsdE9wdGlvbnMpO1xyXG5cclxuXHRcdFx0dGhpcy5fc2V0TGF5ZXJTdHlsZShsYXllciwgc3R5bGUpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHNldFN0eWxlOiBmdW5jdGlvbiAoc3R5bGUpIHtcclxuXHRcdHRoaXMuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0XHR0aGlzLl9zZXRMYXllclN0eWxlKGxheWVyLCBzdHlsZSk7XHJcblx0XHR9LCB0aGlzKTtcclxuXHR9LFxyXG5cclxuXHRfc2V0TGF5ZXJTdHlsZTogZnVuY3Rpb24gKGxheWVyLCBzdHlsZSkge1xyXG5cdFx0aWYgKHR5cGVvZiBzdHlsZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG5cdFx0XHRzdHlsZSA9IHN0eWxlKGxheWVyLmZlYXR1cmUpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGxheWVyLnNldFN0eWxlKSB7XHJcblx0XHRcdGxheWVyLnNldFN0eWxlKHN0eWxlKTtcclxuXHRcdH1cclxuXHR9XHJcbn0pO1xyXG5cclxuTC5leHRlbmQoTC5HZW9KU09OLCB7XHJcblx0Z2VvbWV0cnlUb0xheWVyOiBmdW5jdGlvbiAoZ2VvanNvbiwgcG9pbnRUb0xheWVyLCBjb29yZHNUb0xhdExuZywgdmVjdG9yT3B0aW9ucykge1xyXG5cdFx0dmFyIGdlb21ldHJ5ID0gZ2VvanNvbi50eXBlID09PSAnRmVhdHVyZScgPyBnZW9qc29uLmdlb21ldHJ5IDogZ2VvanNvbixcclxuXHRcdCAgICBjb29yZHMgPSBnZW9tZXRyeS5jb29yZGluYXRlcyxcclxuXHRcdCAgICBsYXllcnMgPSBbXSxcclxuXHRcdCAgICBsYXRsbmcsIGxhdGxuZ3MsIGksIGxlbjtcclxuXHJcblx0XHRjb29yZHNUb0xhdExuZyA9IGNvb3Jkc1RvTGF0TG5nIHx8IHRoaXMuY29vcmRzVG9MYXRMbmc7XHJcblxyXG5cdFx0c3dpdGNoIChnZW9tZXRyeS50eXBlKSB7XHJcblx0XHRjYXNlICdQb2ludCc6XHJcblx0XHRcdGxhdGxuZyA9IGNvb3Jkc1RvTGF0TG5nKGNvb3Jkcyk7XHJcblx0XHRcdHJldHVybiBwb2ludFRvTGF5ZXIgPyBwb2ludFRvTGF5ZXIoZ2VvanNvbiwgbGF0bG5nKSA6IG5ldyBMLk1hcmtlcihsYXRsbmcpO1xyXG5cclxuXHRcdGNhc2UgJ011bHRpUG9pbnQnOlxyXG5cdFx0XHRmb3IgKGkgPSAwLCBsZW4gPSBjb29yZHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0XHRsYXRsbmcgPSBjb29yZHNUb0xhdExuZyhjb29yZHNbaV0pO1xyXG5cdFx0XHRcdGxheWVycy5wdXNoKHBvaW50VG9MYXllciA/IHBvaW50VG9MYXllcihnZW9qc29uLCBsYXRsbmcpIDogbmV3IEwuTWFya2VyKGxhdGxuZykpO1xyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiBuZXcgTC5GZWF0dXJlR3JvdXAobGF5ZXJzKTtcclxuXHJcblx0XHRjYXNlICdMaW5lU3RyaW5nJzpcclxuXHRcdFx0bGF0bG5ncyA9IHRoaXMuY29vcmRzVG9MYXRMbmdzKGNvb3JkcywgMCwgY29vcmRzVG9MYXRMbmcpO1xyXG5cdFx0XHRyZXR1cm4gbmV3IEwuUG9seWxpbmUobGF0bG5ncywgdmVjdG9yT3B0aW9ucyk7XHJcblxyXG5cdFx0Y2FzZSAnUG9seWdvbic6XHJcblx0XHRcdGlmIChjb29yZHMubGVuZ3RoID09PSAyICYmICFjb29yZHNbMV0ubGVuZ3RoKSB7XHJcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEdlb0pTT04gb2JqZWN0LicpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGxhdGxuZ3MgPSB0aGlzLmNvb3Jkc1RvTGF0TG5ncyhjb29yZHMsIDEsIGNvb3Jkc1RvTGF0TG5nKTtcclxuXHRcdFx0cmV0dXJuIG5ldyBMLlBvbHlnb24obGF0bG5ncywgdmVjdG9yT3B0aW9ucyk7XHJcblxyXG5cdFx0Y2FzZSAnTXVsdGlMaW5lU3RyaW5nJzpcclxuXHRcdFx0bGF0bG5ncyA9IHRoaXMuY29vcmRzVG9MYXRMbmdzKGNvb3JkcywgMSwgY29vcmRzVG9MYXRMbmcpO1xyXG5cdFx0XHRyZXR1cm4gbmV3IEwuTXVsdGlQb2x5bGluZShsYXRsbmdzLCB2ZWN0b3JPcHRpb25zKTtcclxuXHJcblx0XHRjYXNlICdNdWx0aVBvbHlnb24nOlxyXG5cdFx0XHRsYXRsbmdzID0gdGhpcy5jb29yZHNUb0xhdExuZ3MoY29vcmRzLCAyLCBjb29yZHNUb0xhdExuZyk7XHJcblx0XHRcdHJldHVybiBuZXcgTC5NdWx0aVBvbHlnb24obGF0bG5ncywgdmVjdG9yT3B0aW9ucyk7XHJcblxyXG5cdFx0Y2FzZSAnR2VvbWV0cnlDb2xsZWN0aW9uJzpcclxuXHRcdFx0Zm9yIChpID0gMCwgbGVuID0gZ2VvbWV0cnkuZ2VvbWV0cmllcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cclxuXHRcdFx0XHRsYXllcnMucHVzaCh0aGlzLmdlb21ldHJ5VG9MYXllcih7XHJcblx0XHRcdFx0XHRnZW9tZXRyeTogZ2VvbWV0cnkuZ2VvbWV0cmllc1tpXSxcclxuXHRcdFx0XHRcdHR5cGU6ICdGZWF0dXJlJyxcclxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IGdlb2pzb24ucHJvcGVydGllc1xyXG5cdFx0XHRcdH0sIHBvaW50VG9MYXllciwgY29vcmRzVG9MYXRMbmcsIHZlY3Rvck9wdGlvbnMpKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gbmV3IEwuRmVhdHVyZUdyb3VwKGxheWVycyk7XHJcblxyXG5cdFx0ZGVmYXVsdDpcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEdlb0pTT04gb2JqZWN0LicpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGNvb3Jkc1RvTGF0TG5nOiBmdW5jdGlvbiAoY29vcmRzKSB7IC8vIChBcnJheVssIEJvb2xlYW5dKSAtPiBMYXRMbmdcclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmcoY29vcmRzWzFdLCBjb29yZHNbMF0sIGNvb3Jkc1syXSk7XHJcblx0fSxcclxuXHJcblx0Y29vcmRzVG9MYXRMbmdzOiBmdW5jdGlvbiAoY29vcmRzLCBsZXZlbHNEZWVwLCBjb29yZHNUb0xhdExuZykgeyAvLyAoQXJyYXlbLCBOdW1iZXIsIEZ1bmN0aW9uXSkgLT4gQXJyYXlcclxuXHRcdHZhciBsYXRsbmcsIGksIGxlbixcclxuXHRcdCAgICBsYXRsbmdzID0gW107XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29vcmRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdGxhdGxuZyA9IGxldmVsc0RlZXAgP1xyXG5cdFx0XHQgICAgICAgIHRoaXMuY29vcmRzVG9MYXRMbmdzKGNvb3Jkc1tpXSwgbGV2ZWxzRGVlcCAtIDEsIGNvb3Jkc1RvTGF0TG5nKSA6XHJcblx0XHRcdCAgICAgICAgKGNvb3Jkc1RvTGF0TG5nIHx8IHRoaXMuY29vcmRzVG9MYXRMbmcpKGNvb3Jkc1tpXSk7XHJcblxyXG5cdFx0XHRsYXRsbmdzLnB1c2gobGF0bG5nKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gbGF0bG5ncztcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdUb0Nvb3JkczogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0dmFyIGNvb3JkcyA9IFtsYXRsbmcubG5nLCBsYXRsbmcubGF0XTtcclxuXHJcblx0XHRpZiAobGF0bG5nLmFsdCAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdGNvb3Jkcy5wdXNoKGxhdGxuZy5hbHQpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGNvb3JkcztcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdzVG9Db29yZHM6IGZ1bmN0aW9uIChsYXRMbmdzKSB7XHJcblx0XHR2YXIgY29vcmRzID0gW107XHJcblxyXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbiA9IGxhdExuZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0Y29vcmRzLnB1c2goTC5HZW9KU09OLmxhdExuZ1RvQ29vcmRzKGxhdExuZ3NbaV0pKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gY29vcmRzO1xyXG5cdH0sXHJcblxyXG5cdGdldEZlYXR1cmU6IGZ1bmN0aW9uIChsYXllciwgbmV3R2VvbWV0cnkpIHtcclxuXHRcdHJldHVybiBsYXllci5mZWF0dXJlID8gTC5leHRlbmQoe30sIGxheWVyLmZlYXR1cmUsIHtnZW9tZXRyeTogbmV3R2VvbWV0cnl9KSA6IEwuR2VvSlNPTi5hc0ZlYXR1cmUobmV3R2VvbWV0cnkpO1xyXG5cdH0sXHJcblxyXG5cdGFzRmVhdHVyZTogZnVuY3Rpb24gKGdlb0pTT04pIHtcclxuXHRcdGlmIChnZW9KU09OLnR5cGUgPT09ICdGZWF0dXJlJykge1xyXG5cdFx0XHRyZXR1cm4gZ2VvSlNPTjtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHR0eXBlOiAnRmVhdHVyZScsXHJcblx0XHRcdHByb3BlcnRpZXM6IHt9LFxyXG5cdFx0XHRnZW9tZXRyeTogZ2VvSlNPTlxyXG5cdFx0fTtcclxuXHR9XHJcbn0pO1xyXG5cclxudmFyIFBvaW50VG9HZW9KU09OID0ge1xyXG5cdHRvR2VvSlNPTjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIEwuR2VvSlNPTi5nZXRGZWF0dXJlKHRoaXMsIHtcclxuXHRcdFx0dHlwZTogJ1BvaW50JyxcclxuXHRcdFx0Y29vcmRpbmF0ZXM6IEwuR2VvSlNPTi5sYXRMbmdUb0Nvb3Jkcyh0aGlzLmdldExhdExuZygpKVxyXG5cdFx0fSk7XHJcblx0fVxyXG59O1xyXG5cclxuTC5NYXJrZXIuaW5jbHVkZShQb2ludFRvR2VvSlNPTik7XHJcbkwuQ2lyY2xlLmluY2x1ZGUoUG9pbnRUb0dlb0pTT04pO1xyXG5MLkNpcmNsZU1hcmtlci5pbmNsdWRlKFBvaW50VG9HZW9KU09OKTtcclxuXHJcbkwuUG9seWxpbmUuaW5jbHVkZSh7XHJcblx0dG9HZW9KU09OOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gTC5HZW9KU09OLmdldEZlYXR1cmUodGhpcywge1xyXG5cdFx0XHR0eXBlOiAnTGluZVN0cmluZycsXHJcblx0XHRcdGNvb3JkaW5hdGVzOiBMLkdlb0pTT04ubGF0TG5nc1RvQ29vcmRzKHRoaXMuZ2V0TGF0TG5ncygpKVxyXG5cdFx0fSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuUG9seWdvbi5pbmNsdWRlKHtcclxuXHR0b0dlb0pTT046IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjb29yZHMgPSBbTC5HZW9KU09OLmxhdExuZ3NUb0Nvb3Jkcyh0aGlzLmdldExhdExuZ3MoKSldLFxyXG5cdFx0ICAgIGksIGxlbiwgaG9sZTtcclxuXHJcblx0XHRjb29yZHNbMF0ucHVzaChjb29yZHNbMF1bMF0pO1xyXG5cclxuXHRcdGlmICh0aGlzLl9ob2xlcykge1xyXG5cdFx0XHRmb3IgKGkgPSAwLCBsZW4gPSB0aGlzLl9ob2xlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRcdGhvbGUgPSBMLkdlb0pTT04ubGF0TG5nc1RvQ29vcmRzKHRoaXMuX2hvbGVzW2ldKTtcclxuXHRcdFx0XHRob2xlLnB1c2goaG9sZVswXSk7XHJcblx0XHRcdFx0Y29vcmRzLnB1c2goaG9sZSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gTC5HZW9KU09OLmdldEZlYXR1cmUodGhpcywge1xyXG5cdFx0XHR0eXBlOiAnUG9seWdvbicsXHJcblx0XHRcdGNvb3JkaW5hdGVzOiBjb29yZHNcclxuXHRcdH0pO1xyXG5cdH1cclxufSk7XHJcblxyXG4oZnVuY3Rpb24gKCkge1xyXG5cdGZ1bmN0aW9uIG11bHRpVG9HZW9KU09OKHR5cGUpIHtcclxuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdHZhciBjb29yZHMgPSBbXTtcclxuXHJcblx0XHRcdHRoaXMuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0XHRcdGNvb3Jkcy5wdXNoKGxheWVyLnRvR2VvSlNPTigpLmdlb21ldHJ5LmNvb3JkaW5hdGVzKTtcclxuXHRcdFx0fSk7XHJcblxyXG5cdFx0XHRyZXR1cm4gTC5HZW9KU09OLmdldEZlYXR1cmUodGhpcywge1xyXG5cdFx0XHRcdHR5cGU6IHR5cGUsXHJcblx0XHRcdFx0Y29vcmRpbmF0ZXM6IGNvb3Jkc1xyXG5cdFx0XHR9KTtcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRMLk11bHRpUG9seWxpbmUuaW5jbHVkZSh7dG9HZW9KU09OOiBtdWx0aVRvR2VvSlNPTignTXVsdGlMaW5lU3RyaW5nJyl9KTtcclxuXHRMLk11bHRpUG9seWdvbi5pbmNsdWRlKHt0b0dlb0pTT046IG11bHRpVG9HZW9KU09OKCdNdWx0aVBvbHlnb24nKX0pO1xyXG5cclxuXHRMLkxheWVyR3JvdXAuaW5jbHVkZSh7XHJcblx0XHR0b0dlb0pTT046IGZ1bmN0aW9uICgpIHtcclxuXHJcblx0XHRcdHZhciBnZW9tZXRyeSA9IHRoaXMuZmVhdHVyZSAmJiB0aGlzLmZlYXR1cmUuZ2VvbWV0cnksXHJcblx0XHRcdFx0anNvbnMgPSBbXSxcclxuXHRcdFx0XHRqc29uO1xyXG5cclxuXHRcdFx0aWYgKGdlb21ldHJ5ICYmIGdlb21ldHJ5LnR5cGUgPT09ICdNdWx0aVBvaW50Jykge1xyXG5cdFx0XHRcdHJldHVybiBtdWx0aVRvR2VvSlNPTignTXVsdGlQb2ludCcpLmNhbGwodGhpcyk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHZhciBpc0dlb21ldHJ5Q29sbGVjdGlvbiA9IGdlb21ldHJ5ICYmIGdlb21ldHJ5LnR5cGUgPT09ICdHZW9tZXRyeUNvbGxlY3Rpb24nO1xyXG5cclxuXHRcdFx0dGhpcy5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRcdFx0aWYgKGxheWVyLnRvR2VvSlNPTikge1xyXG5cdFx0XHRcdFx0anNvbiA9IGxheWVyLnRvR2VvSlNPTigpO1xyXG5cdFx0XHRcdFx0anNvbnMucHVzaChpc0dlb21ldHJ5Q29sbGVjdGlvbiA/IGpzb24uZ2VvbWV0cnkgOiBMLkdlb0pTT04uYXNGZWF0dXJlKGpzb24pKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0aWYgKGlzR2VvbWV0cnlDb2xsZWN0aW9uKSB7XHJcblx0XHRcdFx0cmV0dXJuIEwuR2VvSlNPTi5nZXRGZWF0dXJlKHRoaXMsIHtcclxuXHRcdFx0XHRcdGdlb21ldHJpZXM6IGpzb25zLFxyXG5cdFx0XHRcdFx0dHlwZTogJ0dlb21ldHJ5Q29sbGVjdGlvbidcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHR0eXBlOiAnRmVhdHVyZUNvbGxlY3Rpb24nLFxyXG5cdFx0XHRcdGZlYXR1cmVzOiBqc29uc1xyXG5cdFx0XHR9O1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59KCkpO1xyXG5cclxuTC5nZW9Kc29uID0gZnVuY3Rpb24gKGdlb2pzb24sIG9wdGlvbnMpIHtcclxuXHRyZXR1cm4gbmV3IEwuR2VvSlNPTihnZW9qc29uLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuRG9tRXZlbnQgY29udGFpbnMgZnVuY3Rpb25zIGZvciB3b3JraW5nIHdpdGggRE9NIGV2ZW50cy5cclxuICovXHJcblxyXG5MLkRvbUV2ZW50ID0ge1xyXG5cdC8qIGluc3BpcmVkIGJ5IEpvaG4gUmVzaWcsIERlYW4gRWR3YXJkcyBhbmQgWVVJIGFkZEV2ZW50IGltcGxlbWVudGF0aW9ucyAqL1xyXG5cdGFkZExpc3RlbmVyOiBmdW5jdGlvbiAob2JqLCB0eXBlLCBmbiwgY29udGV4dCkgeyAvLyAoSFRNTEVsZW1lbnQsIFN0cmluZywgRnVuY3Rpb25bLCBPYmplY3RdKVxyXG5cclxuXHRcdHZhciBpZCA9IEwuc3RhbXAoZm4pLFxyXG5cdFx0ICAgIGtleSA9ICdfbGVhZmxldF8nICsgdHlwZSArIGlkLFxyXG5cdFx0ICAgIGhhbmRsZXIsIG9yaWdpbmFsSGFuZGxlciwgbmV3VHlwZTtcclxuXHJcblx0XHRpZiAob2JqW2tleV0pIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHRoYW5kbGVyID0gZnVuY3Rpb24gKGUpIHtcclxuXHRcdFx0cmV0dXJuIGZuLmNhbGwoY29udGV4dCB8fCBvYmosIGUgfHwgTC5Eb21FdmVudC5fZ2V0RXZlbnQoKSk7XHJcblx0XHR9O1xyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIucG9pbnRlciAmJiB0eXBlLmluZGV4T2YoJ3RvdWNoJykgPT09IDApIHtcclxuXHRcdFx0cmV0dXJuIHRoaXMuYWRkUG9pbnRlckxpc3RlbmVyKG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKEwuQnJvd3Nlci50b3VjaCAmJiAodHlwZSA9PT0gJ2RibGNsaWNrJykgJiYgdGhpcy5hZGREb3VibGVUYXBMaXN0ZW5lcikge1xyXG5cdFx0XHR0aGlzLmFkZERvdWJsZVRhcExpc3RlbmVyKG9iaiwgaGFuZGxlciwgaWQpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICgnYWRkRXZlbnRMaXN0ZW5lcicgaW4gb2JqKSB7XHJcblxyXG5cdFx0XHRpZiAodHlwZSA9PT0gJ21vdXNld2hlZWwnKSB7XHJcblx0XHRcdFx0b2JqLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU1vdXNlU2Nyb2xsJywgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHRcdG9iai5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHJcblx0XHRcdH0gZWxzZSBpZiAoKHR5cGUgPT09ICdtb3VzZWVudGVyJykgfHwgKHR5cGUgPT09ICdtb3VzZWxlYXZlJykpIHtcclxuXHJcblx0XHRcdFx0b3JpZ2luYWxIYW5kbGVyID0gaGFuZGxlcjtcclxuXHRcdFx0XHRuZXdUeXBlID0gKHR5cGUgPT09ICdtb3VzZWVudGVyJyA/ICdtb3VzZW92ZXInIDogJ21vdXNlb3V0Jyk7XHJcblxyXG5cdFx0XHRcdGhhbmRsZXIgPSBmdW5jdGlvbiAoZSkge1xyXG5cdFx0XHRcdFx0aWYgKCFMLkRvbUV2ZW50Ll9jaGVja01vdXNlKG9iaiwgZSkpIHsgcmV0dXJuOyB9XHJcblx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxIYW5kbGVyKGUpO1xyXG5cdFx0XHRcdH07XHJcblxyXG5cdFx0XHRcdG9iai5hZGRFdmVudExpc3RlbmVyKG5ld1R5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHJcblx0XHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gJ2NsaWNrJyAmJiBMLkJyb3dzZXIuYW5kcm9pZCkge1xyXG5cdFx0XHRcdG9yaWdpbmFsSGFuZGxlciA9IGhhbmRsZXI7XHJcblx0XHRcdFx0aGFuZGxlciA9IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRcdFx0XHRyZXR1cm4gTC5Eb21FdmVudC5fZmlsdGVyQ2xpY2soZSwgb3JpZ2luYWxIYW5kbGVyKTtcclxuXHRcdFx0XHR9O1xyXG5cclxuXHRcdFx0XHRvYmouYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBoYW5kbGVyLCBmYWxzZSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0b2JqLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0fSBlbHNlIGlmICgnYXR0YWNoRXZlbnQnIGluIG9iaikge1xyXG5cdFx0XHRvYmouYXR0YWNoRXZlbnQoJ29uJyArIHR5cGUsIGhhbmRsZXIpO1xyXG5cdFx0fVxyXG5cclxuXHRcdG9ialtrZXldID0gaGFuZGxlcjtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRyZW1vdmVMaXN0ZW5lcjogZnVuY3Rpb24gKG9iaiwgdHlwZSwgZm4pIHsgIC8vIChIVE1MRWxlbWVudCwgU3RyaW5nLCBGdW5jdGlvbilcclxuXHJcblx0XHR2YXIgaWQgPSBMLnN0YW1wKGZuKSxcclxuXHRcdCAgICBrZXkgPSAnX2xlYWZsZXRfJyArIHR5cGUgKyBpZCxcclxuXHRcdCAgICBoYW5kbGVyID0gb2JqW2tleV07XHJcblxyXG5cdFx0aWYgKCFoYW5kbGVyKSB7IHJldHVybiB0aGlzOyB9XHJcblxyXG5cdFx0aWYgKEwuQnJvd3Nlci5wb2ludGVyICYmIHR5cGUuaW5kZXhPZigndG91Y2gnKSA9PT0gMCkge1xyXG5cdFx0XHR0aGlzLnJlbW92ZVBvaW50ZXJMaXN0ZW5lcihvYmosIHR5cGUsIGlkKTtcclxuXHRcdH0gZWxzZSBpZiAoTC5Ccm93c2VyLnRvdWNoICYmICh0eXBlID09PSAnZGJsY2xpY2snKSAmJiB0aGlzLnJlbW92ZURvdWJsZVRhcExpc3RlbmVyKSB7XHJcblx0XHRcdHRoaXMucmVtb3ZlRG91YmxlVGFwTGlzdGVuZXIob2JqLCBpZCk7XHJcblxyXG5cdFx0fSBlbHNlIGlmICgncmVtb3ZlRXZlbnRMaXN0ZW5lcicgaW4gb2JqKSB7XHJcblxyXG5cdFx0XHRpZiAodHlwZSA9PT0gJ21vdXNld2hlZWwnKSB7XHJcblx0XHRcdFx0b2JqLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU1vdXNlU2Nyb2xsJywgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHJcblx0XHRcdH0gZWxzZSBpZiAoKHR5cGUgPT09ICdtb3VzZWVudGVyJykgfHwgKHR5cGUgPT09ICdtb3VzZWxlYXZlJykpIHtcclxuXHRcdFx0XHRvYmoucmVtb3ZlRXZlbnRMaXN0ZW5lcigodHlwZSA9PT0gJ21vdXNlZW50ZXInID8gJ21vdXNlb3ZlcicgOiAnbW91c2VvdXQnKSwgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIGlmICgnZGV0YWNoRXZlbnQnIGluIG9iaikge1xyXG5cdFx0XHRvYmouZGV0YWNoRXZlbnQoJ29uJyArIHR5cGUsIGhhbmRsZXIpO1xyXG5cdFx0fVxyXG5cclxuXHRcdG9ialtrZXldID0gbnVsbDtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzdG9wUHJvcGFnYXRpb246IGZ1bmN0aW9uIChlKSB7XHJcblxyXG5cdFx0aWYgKGUuc3RvcFByb3BhZ2F0aW9uKSB7XHJcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRlLmNhbmNlbEJ1YmJsZSA9IHRydWU7XHJcblx0XHR9XHJcblx0XHRMLkRvbUV2ZW50Ll9za2lwcGVkKGUpO1xyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGRpc2FibGVTY3JvbGxQcm9wYWdhdGlvbjogZnVuY3Rpb24gKGVsKSB7XHJcblx0XHR2YXIgc3RvcCA9IEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uO1xyXG5cclxuXHRcdHJldHVybiBMLkRvbUV2ZW50XHJcblx0XHRcdC5vbihlbCwgJ21vdXNld2hlZWwnLCBzdG9wKVxyXG5cdFx0XHQub24oZWwsICdNb3pNb3VzZVBpeGVsU2Nyb2xsJywgc3RvcCk7XHJcblx0fSxcclxuXHJcblx0ZGlzYWJsZUNsaWNrUHJvcGFnYXRpb246IGZ1bmN0aW9uIChlbCkge1xyXG5cdFx0dmFyIHN0b3AgPSBMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbjtcclxuXHJcblx0XHRmb3IgKHZhciBpID0gTC5EcmFnZ2FibGUuU1RBUlQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0TC5Eb21FdmVudC5vbihlbCwgTC5EcmFnZ2FibGUuU1RBUlRbaV0sIHN0b3ApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBMLkRvbUV2ZW50XHJcblx0XHRcdC5vbihlbCwgJ2NsaWNrJywgTC5Eb21FdmVudC5fZmFrZVN0b3ApXHJcblx0XHRcdC5vbihlbCwgJ2RibGNsaWNrJywgc3RvcCk7XHJcblx0fSxcclxuXHJcblx0cHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uIChlKSB7XHJcblxyXG5cdFx0aWYgKGUucHJldmVudERlZmF1bHQpIHtcclxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0ZS5yZXR1cm5WYWx1ZSA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0c3RvcDogZnVuY3Rpb24gKGUpIHtcclxuXHRcdHJldHVybiBMLkRvbUV2ZW50XHJcblx0XHRcdC5wcmV2ZW50RGVmYXVsdChlKVxyXG5cdFx0XHQuc3RvcFByb3BhZ2F0aW9uKGUpO1xyXG5cdH0sXHJcblxyXG5cdGdldE1vdXNlUG9zaXRpb246IGZ1bmN0aW9uIChlLCBjb250YWluZXIpIHtcclxuXHRcdGlmICghY29udGFpbmVyKSB7XHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChlLmNsaWVudFgsIGUuY2xpZW50WSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIHJlY3QgPSBjb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KFxyXG5cdFx0XHRlLmNsaWVudFggLSByZWN0LmxlZnQgLSBjb250YWluZXIuY2xpZW50TGVmdCxcclxuXHRcdFx0ZS5jbGllbnRZIC0gcmVjdC50b3AgLSBjb250YWluZXIuY2xpZW50VG9wKTtcclxuXHR9LFxyXG5cclxuXHRnZXRXaGVlbERlbHRhOiBmdW5jdGlvbiAoZSkge1xyXG5cclxuXHRcdHZhciBkZWx0YSA9IDA7XHJcblxyXG5cdFx0aWYgKGUud2hlZWxEZWx0YSkge1xyXG5cdFx0XHRkZWx0YSA9IGUud2hlZWxEZWx0YSAvIDEyMDtcclxuXHRcdH1cclxuXHRcdGlmIChlLmRldGFpbCkge1xyXG5cdFx0XHRkZWx0YSA9IC1lLmRldGFpbCAvIDM7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZGVsdGE7XHJcblx0fSxcclxuXHJcblx0X3NraXBFdmVudHM6IHt9LFxyXG5cclxuXHRfZmFrZVN0b3A6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHQvLyBmYWtlcyBzdG9wUHJvcGFnYXRpb24gYnkgc2V0dGluZyBhIHNwZWNpYWwgZXZlbnQgZmxhZywgY2hlY2tlZC9yZXNldCB3aXRoIEwuRG9tRXZlbnQuX3NraXBwZWQoZSlcclxuXHRcdEwuRG9tRXZlbnQuX3NraXBFdmVudHNbZS50eXBlXSA9IHRydWU7XHJcblx0fSxcclxuXHJcblx0X3NraXBwZWQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR2YXIgc2tpcHBlZCA9IHRoaXMuX3NraXBFdmVudHNbZS50eXBlXTtcclxuXHRcdC8vIHJlc2V0IHdoZW4gY2hlY2tpbmcsIGFzIGl0J3Mgb25seSB1c2VkIGluIG1hcCBjb250YWluZXIgYW5kIHByb3BhZ2F0ZXMgb3V0c2lkZSBvZiB0aGUgbWFwXHJcblx0XHR0aGlzLl9za2lwRXZlbnRzW2UudHlwZV0gPSBmYWxzZTtcclxuXHRcdHJldHVybiBza2lwcGVkO1xyXG5cdH0sXHJcblxyXG5cdC8vIGNoZWNrIGlmIGVsZW1lbnQgcmVhbGx5IGxlZnQvZW50ZXJlZCB0aGUgZXZlbnQgdGFyZ2V0IChmb3IgbW91c2VlbnRlci9tb3VzZWxlYXZlKVxyXG5cdF9jaGVja01vdXNlOiBmdW5jdGlvbiAoZWwsIGUpIHtcclxuXHJcblx0XHR2YXIgcmVsYXRlZCA9IGUucmVsYXRlZFRhcmdldDtcclxuXHJcblx0XHRpZiAoIXJlbGF0ZWQpIHsgcmV0dXJuIHRydWU7IH1cclxuXHJcblx0XHR0cnkge1xyXG5cdFx0XHR3aGlsZSAocmVsYXRlZCAmJiAocmVsYXRlZCAhPT0gZWwpKSB7XHJcblx0XHRcdFx0cmVsYXRlZCA9IHJlbGF0ZWQucGFyZW50Tm9kZTtcclxuXHRcdFx0fVxyXG5cdFx0fSBjYXRjaCAoZXJyKSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdH1cclxuXHRcdHJldHVybiAocmVsYXRlZCAhPT0gZWwpO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRFdmVudDogZnVuY3Rpb24gKCkgeyAvLyBldmlsIG1hZ2ljIGZvciBJRVxyXG5cdFx0Lypqc2hpbnQgbm9hcmc6ZmFsc2UgKi9cclxuXHRcdHZhciBlID0gd2luZG93LmV2ZW50O1xyXG5cdFx0aWYgKCFlKSB7XHJcblx0XHRcdHZhciBjYWxsZXIgPSBhcmd1bWVudHMuY2FsbGVlLmNhbGxlcjtcclxuXHRcdFx0d2hpbGUgKGNhbGxlcikge1xyXG5cdFx0XHRcdGUgPSBjYWxsZXJbJ2FyZ3VtZW50cyddWzBdO1xyXG5cdFx0XHRcdGlmIChlICYmIHdpbmRvdy5FdmVudCA9PT0gZS5jb25zdHJ1Y3Rvcikge1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGNhbGxlciA9IGNhbGxlci5jYWxsZXI7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdHJldHVybiBlO1xyXG5cdH0sXHJcblxyXG5cdC8vIHRoaXMgaXMgYSBob3JyaWJsZSB3b3JrYXJvdW5kIGZvciBhIGJ1ZyBpbiBBbmRyb2lkIHdoZXJlIGEgc2luZ2xlIHRvdWNoIHRyaWdnZXJzIHR3byBjbGljayBldmVudHNcclxuXHRfZmlsdGVyQ2xpY2s6IGZ1bmN0aW9uIChlLCBoYW5kbGVyKSB7XHJcblx0XHR2YXIgdGltZVN0YW1wID0gKGUudGltZVN0YW1wIHx8IGUub3JpZ2luYWxFdmVudC50aW1lU3RhbXApLFxyXG5cdFx0XHRlbGFwc2VkID0gTC5Eb21FdmVudC5fbGFzdENsaWNrICYmICh0aW1lU3RhbXAgLSBMLkRvbUV2ZW50Ll9sYXN0Q2xpY2spO1xyXG5cclxuXHRcdC8vIGFyZSB0aGV5IGNsb3NlciB0b2dldGhlciB0aGFuIDUwMG1zIHlldCBtb3JlIHRoYW4gMTAwbXM/XHJcblx0XHQvLyBBbmRyb2lkIHR5cGljYWxseSB0cmlnZ2VycyB0aGVtIH4zMDBtcyBhcGFydCB3aGlsZSBtdWx0aXBsZSBsaXN0ZW5lcnNcclxuXHRcdC8vIG9uIHRoZSBzYW1lIGV2ZW50IHNob3VsZCBiZSB0cmlnZ2VyZWQgZmFyIGZhc3RlcjtcclxuXHRcdC8vIG9yIGNoZWNrIGlmIGNsaWNrIGlzIHNpbXVsYXRlZCBvbiB0aGUgZWxlbWVudCwgYW5kIGlmIGl0IGlzLCByZWplY3QgYW55IG5vbi1zaW11bGF0ZWQgZXZlbnRzXHJcblxyXG5cdFx0aWYgKChlbGFwc2VkICYmIGVsYXBzZWQgPiAxMDAgJiYgZWxhcHNlZCA8IDUwMCkgfHwgKGUudGFyZ2V0Ll9zaW11bGF0ZWRDbGljayAmJiAhZS5fc2ltdWxhdGVkKSkge1xyXG5cdFx0XHRMLkRvbUV2ZW50LnN0b3AoZSk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdEwuRG9tRXZlbnQuX2xhc3RDbGljayA9IHRpbWVTdGFtcDtcclxuXHJcblx0XHRyZXR1cm4gaGFuZGxlcihlKTtcclxuXHR9XHJcbn07XHJcblxyXG5MLkRvbUV2ZW50Lm9uID0gTC5Eb21FdmVudC5hZGRMaXN0ZW5lcjtcclxuTC5Eb21FdmVudC5vZmYgPSBMLkRvbUV2ZW50LnJlbW92ZUxpc3RlbmVyO1xyXG5cblxuLypcclxuICogTC5EcmFnZ2FibGUgYWxsb3dzIHlvdSB0byBhZGQgZHJhZ2dpbmcgY2FwYWJpbGl0aWVzIHRvIGFueSBlbGVtZW50LiBTdXBwb3J0cyBtb2JpbGUgZGV2aWNlcyB0b28uXHJcbiAqL1xyXG5cclxuTC5EcmFnZ2FibGUgPSBMLkNsYXNzLmV4dGVuZCh7XHJcblx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxyXG5cclxuXHRzdGF0aWNzOiB7XHJcblx0XHRTVEFSVDogTC5Ccm93c2VyLnRvdWNoID8gWyd0b3VjaHN0YXJ0JywgJ21vdXNlZG93biddIDogWydtb3VzZWRvd24nXSxcclxuXHRcdEVORDoge1xyXG5cdFx0XHRtb3VzZWRvd246ICdtb3VzZXVwJyxcclxuXHRcdFx0dG91Y2hzdGFydDogJ3RvdWNoZW5kJyxcclxuXHRcdFx0cG9pbnRlcmRvd246ICd0b3VjaGVuZCcsXHJcblx0XHRcdE1TUG9pbnRlckRvd246ICd0b3VjaGVuZCdcclxuXHRcdH0sXHJcblx0XHRNT1ZFOiB7XHJcblx0XHRcdG1vdXNlZG93bjogJ21vdXNlbW92ZScsXHJcblx0XHRcdHRvdWNoc3RhcnQ6ICd0b3VjaG1vdmUnLFxyXG5cdFx0XHRwb2ludGVyZG93bjogJ3RvdWNobW92ZScsXHJcblx0XHRcdE1TUG9pbnRlckRvd246ICd0b3VjaG1vdmUnXHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKGVsZW1lbnQsIGRyYWdTdGFydFRhcmdldCkge1xyXG5cdFx0dGhpcy5fZWxlbWVudCA9IGVsZW1lbnQ7XHJcblx0XHR0aGlzLl9kcmFnU3RhcnRUYXJnZXQgPSBkcmFnU3RhcnRUYXJnZXQgfHwgZWxlbWVudDtcclxuXHR9LFxyXG5cclxuXHRlbmFibGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9lbmFibGVkKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGZvciAodmFyIGkgPSBMLkRyYWdnYWJsZS5TVEFSVC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9uKHRoaXMuX2RyYWdTdGFydFRhcmdldCwgTC5EcmFnZ2FibGUuU1RBUlRbaV0sIHRoaXMuX29uRG93biwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fZW5hYmxlZCA9IHRydWU7XHJcblx0fSxcclxuXHJcblx0ZGlzYWJsZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGZvciAodmFyIGkgPSBMLkRyYWdnYWJsZS5TVEFSVC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9kcmFnU3RhcnRUYXJnZXQsIEwuRHJhZ2dhYmxlLlNUQVJUW2ldLCB0aGlzLl9vbkRvd24sIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2VuYWJsZWQgPSBmYWxzZTtcclxuXHRcdHRoaXMuX21vdmVkID0gZmFsc2U7XHJcblx0fSxcclxuXHJcblx0X29uRG93bjogZnVuY3Rpb24gKGUpIHtcclxuXHRcdHRoaXMuX21vdmVkID0gZmFsc2U7XHJcblxyXG5cdFx0aWYgKGUuc2hpZnRLZXkgfHwgKChlLndoaWNoICE9PSAxKSAmJiAoZS5idXR0b24gIT09IDEpICYmICFlLnRvdWNoZXMpKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xyXG5cclxuXHRcdGlmIChMLkRyYWdnYWJsZS5fZGlzYWJsZWQpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0TC5Eb21VdGlsLmRpc2FibGVJbWFnZURyYWcoKTtcclxuXHRcdEwuRG9tVXRpbC5kaXNhYmxlVGV4dFNlbGVjdGlvbigpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9tb3ZpbmcpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIGZpcnN0ID0gZS50b3VjaGVzID8gZS50b3VjaGVzWzBdIDogZTtcclxuXHJcblx0XHR0aGlzLl9zdGFydFBvaW50ID0gbmV3IEwuUG9pbnQoZmlyc3QuY2xpZW50WCwgZmlyc3QuY2xpZW50WSk7XHJcblx0XHR0aGlzLl9zdGFydFBvcyA9IHRoaXMuX25ld1BvcyA9IEwuRG9tVXRpbC5nZXRQb3NpdGlvbih0aGlzLl9lbGVtZW50KTtcclxuXHJcblx0XHRMLkRvbUV2ZW50XHJcblx0XHQgICAgLm9uKGRvY3VtZW50LCBMLkRyYWdnYWJsZS5NT1ZFW2UudHlwZV0sIHRoaXMuX29uTW92ZSwgdGhpcylcclxuXHRcdCAgICAub24oZG9jdW1lbnQsIEwuRHJhZ2dhYmxlLkVORFtlLnR5cGVdLCB0aGlzLl9vblVwLCB0aGlzKTtcclxuXHR9LFxyXG5cclxuXHRfb25Nb3ZlOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0aWYgKGUudG91Y2hlcyAmJiBlLnRvdWNoZXMubGVuZ3RoID4gMSkge1xyXG5cdFx0XHR0aGlzLl9tb3ZlZCA9IHRydWU7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgZmlyc3QgPSAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPT09IDEgPyBlLnRvdWNoZXNbMF0gOiBlKSxcclxuXHRcdCAgICBuZXdQb2ludCA9IG5ldyBMLlBvaW50KGZpcnN0LmNsaWVudFgsIGZpcnN0LmNsaWVudFkpLFxyXG5cdFx0ICAgIG9mZnNldCA9IG5ld1BvaW50LnN1YnRyYWN0KHRoaXMuX3N0YXJ0UG9pbnQpO1xyXG5cclxuXHRcdGlmICghb2Zmc2V0LnggJiYgIW9mZnNldC55KSB7IHJldHVybjsgfVxyXG5cdFx0aWYgKEwuQnJvd3Nlci50b3VjaCAmJiBNYXRoLmFicyhvZmZzZXQueCkgKyBNYXRoLmFicyhvZmZzZXQueSkgPCAzKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XHJcblxyXG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCkge1xyXG5cdFx0XHR0aGlzLmZpcmUoJ2RyYWdzdGFydCcpO1xyXG5cclxuXHRcdFx0dGhpcy5fbW92ZWQgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLl9zdGFydFBvcyA9IEwuRG9tVXRpbC5nZXRQb3NpdGlvbih0aGlzLl9lbGVtZW50KS5zdWJ0cmFjdChvZmZzZXQpO1xyXG5cclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKGRvY3VtZW50LmJvZHksICdsZWFmbGV0LWRyYWdnaW5nJyk7XHJcblx0XHRcdHRoaXMuX2xhc3RUYXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XHJcblx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9sYXN0VGFyZ2V0LCAnbGVhZmxldC1kcmFnLXRhcmdldCcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX25ld1BvcyA9IHRoaXMuX3N0YXJ0UG9zLmFkZChvZmZzZXQpO1xyXG5cdFx0dGhpcy5fbW92aW5nID0gdHJ1ZTtcclxuXHJcblx0XHRMLlV0aWwuY2FuY2VsQW5pbUZyYW1lKHRoaXMuX2FuaW1SZXF1ZXN0KTtcclxuXHRcdHRoaXMuX2FuaW1SZXF1ZXN0ID0gTC5VdGlsLnJlcXVlc3RBbmltRnJhbWUodGhpcy5fdXBkYXRlUG9zaXRpb24sIHRoaXMsIHRydWUsIHRoaXMuX2RyYWdTdGFydFRhcmdldCk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVBvc2l0aW9uOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLmZpcmUoJ3ByZWRyYWcnKTtcclxuXHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9lbGVtZW50LCB0aGlzLl9uZXdQb3MpO1xyXG5cdFx0dGhpcy5maXJlKCdkcmFnJyk7XHJcblx0fSxcclxuXHJcblx0X29uVXA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyhkb2N1bWVudC5ib2R5LCAnbGVhZmxldC1kcmFnZ2luZycpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9sYXN0VGFyZ2V0KSB7XHJcblx0XHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aGlzLl9sYXN0VGFyZ2V0LCAnbGVhZmxldC1kcmFnLXRhcmdldCcpO1xyXG5cdFx0XHR0aGlzLl9sYXN0VGFyZ2V0ID0gbnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRmb3IgKHZhciBpIGluIEwuRHJhZ2dhYmxlLk1PVkUpIHtcclxuXHRcdFx0TC5Eb21FdmVudFxyXG5cdFx0XHQgICAgLm9mZihkb2N1bWVudCwgTC5EcmFnZ2FibGUuTU9WRVtpXSwgdGhpcy5fb25Nb3ZlKVxyXG5cdFx0XHQgICAgLm9mZihkb2N1bWVudCwgTC5EcmFnZ2FibGUuRU5EW2ldLCB0aGlzLl9vblVwKTtcclxuXHRcdH1cclxuXHJcblx0XHRMLkRvbVV0aWwuZW5hYmxlSW1hZ2VEcmFnKCk7XHJcblx0XHRMLkRvbVV0aWwuZW5hYmxlVGV4dFNlbGVjdGlvbigpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9tb3ZlZCAmJiB0aGlzLl9tb3ZpbmcpIHtcclxuXHRcdFx0Ly8gZW5zdXJlIGRyYWcgaXMgbm90IGZpcmVkIGFmdGVyIGRyYWdlbmRcclxuXHRcdFx0TC5VdGlsLmNhbmNlbEFuaW1GcmFtZSh0aGlzLl9hbmltUmVxdWVzdCk7XHJcblxyXG5cdFx0XHR0aGlzLmZpcmUoJ2RyYWdlbmQnLCB7XHJcblx0XHRcdFx0ZGlzdGFuY2U6IHRoaXMuX25ld1Bvcy5kaXN0YW5jZVRvKHRoaXMuX3N0YXJ0UG9zKVxyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9tb3ZpbmcgPSBmYWxzZTtcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcblx0TC5IYW5kbGVyIGlzIGEgYmFzZSBjbGFzcyBmb3IgaGFuZGxlciBjbGFzc2VzIHRoYXQgYXJlIHVzZWQgaW50ZXJuYWxseSB0byBpbmplY3Rcblx0aW50ZXJhY3Rpb24gZmVhdHVyZXMgbGlrZSBkcmFnZ2luZyB0byBjbGFzc2VzIGxpa2UgTWFwIGFuZCBNYXJrZXIuXG4qL1xuXG5MLkhhbmRsZXIgPSBMLkNsYXNzLmV4dGVuZCh7XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChtYXApIHtcblx0XHR0aGlzLl9tYXAgPSBtYXA7XG5cdH0sXG5cblx0ZW5hYmxlOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKHRoaXMuX2VuYWJsZWQpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLl9lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmFkZEhvb2tzKCk7XG5cdH0sXG5cblx0ZGlzYWJsZTogZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkgeyByZXR1cm47IH1cblxuXHRcdHRoaXMuX2VuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLnJlbW92ZUhvb2tzKCk7XG5cdH0sXG5cblx0ZW5hYmxlZDogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2VuYWJsZWQ7XG5cdH1cbn0pO1xuXG5cbi8qXG4gKiBMLkhhbmRsZXIuTWFwRHJhZyBpcyB1c2VkIHRvIG1ha2UgdGhlIG1hcCBkcmFnZ2FibGUgKHdpdGggcGFubmluZyBpbmVydGlhKSwgZW5hYmxlZCBieSBkZWZhdWx0LlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdGRyYWdnaW5nOiB0cnVlLFxuXG5cdGluZXJ0aWE6ICFMLkJyb3dzZXIuYW5kcm9pZDIzLFxuXHRpbmVydGlhRGVjZWxlcmF0aW9uOiAzNDAwLCAvLyBweC9zXjJcblx0aW5lcnRpYU1heFNwZWVkOiBJbmZpbml0eSwgLy8gcHgvc1xuXHRpbmVydGlhVGhyZXNob2xkOiBMLkJyb3dzZXIudG91Y2ggPyAzMiA6IDE4LCAvLyBtc1xuXHRlYXNlTGluZWFyaXR5OiAwLjI1LFxuXG5cdC8vIFRPRE8gcmVmYWN0b3IsIG1vdmUgdG8gQ1JTXG5cdHdvcmxkQ29weUp1bXA6IGZhbHNlXG59KTtcblxuTC5NYXAuRHJhZyA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdGhpcy5fZHJhZ2dhYmxlKSB7XG5cdFx0XHR2YXIgbWFwID0gdGhpcy5fbWFwO1xuXG5cdFx0XHR0aGlzLl9kcmFnZ2FibGUgPSBuZXcgTC5EcmFnZ2FibGUobWFwLl9tYXBQYW5lLCBtYXAuX2NvbnRhaW5lcik7XG5cblx0XHRcdHRoaXMuX2RyYWdnYWJsZS5vbih7XG5cdFx0XHRcdCdkcmFnc3RhcnQnOiB0aGlzLl9vbkRyYWdTdGFydCxcblx0XHRcdFx0J2RyYWcnOiB0aGlzLl9vbkRyYWcsXG5cdFx0XHRcdCdkcmFnZW5kJzogdGhpcy5fb25EcmFnRW5kXG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0aWYgKG1hcC5vcHRpb25zLndvcmxkQ29weUp1bXApIHtcblx0XHRcdFx0dGhpcy5fZHJhZ2dhYmxlLm9uKCdwcmVkcmFnJywgdGhpcy5fb25QcmVEcmFnLCB0aGlzKTtcblx0XHRcdFx0bWFwLm9uKCd2aWV3cmVzZXQnLCB0aGlzLl9vblZpZXdSZXNldCwgdGhpcyk7XG5cblx0XHRcdFx0bWFwLndoZW5SZWFkeSh0aGlzLl9vblZpZXdSZXNldCwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2RyYWdnYWJsZS5lbmFibGUoKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX2RyYWdnYWJsZS5kaXNhYmxlKCk7XG5cdH0sXG5cblx0bW92ZWQ6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZHJhZ2dhYmxlICYmIHRoaXMuX2RyYWdnYWJsZS5fbW92ZWQ7XG5cdH0sXG5cblx0X29uRHJhZ1N0YXJ0OiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcDtcblxuXHRcdGlmIChtYXAuX3BhbkFuaW0pIHtcblx0XHRcdG1hcC5fcGFuQW5pbS5zdG9wKCk7XG5cdFx0fVxuXG5cdFx0bWFwXG5cdFx0ICAgIC5maXJlKCdtb3Zlc3RhcnQnKVxuXHRcdCAgICAuZmlyZSgnZHJhZ3N0YXJ0Jyk7XG5cblx0XHRpZiAobWFwLm9wdGlvbnMuaW5lcnRpYSkge1xuXHRcdFx0dGhpcy5fcG9zaXRpb25zID0gW107XG5cdFx0XHR0aGlzLl90aW1lcyA9IFtdO1xuXHRcdH1cblx0fSxcblxuXHRfb25EcmFnOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKHRoaXMuX21hcC5vcHRpb25zLmluZXJ0aWEpIHtcblx0XHRcdHZhciB0aW1lID0gdGhpcy5fbGFzdFRpbWUgPSArbmV3IERhdGUoKSxcblx0XHRcdCAgICBwb3MgPSB0aGlzLl9sYXN0UG9zID0gdGhpcy5fZHJhZ2dhYmxlLl9uZXdQb3M7XG5cblx0XHRcdHRoaXMuX3Bvc2l0aW9ucy5wdXNoKHBvcyk7XG5cdFx0XHR0aGlzLl90aW1lcy5wdXNoKHRpbWUpO1xuXG5cdFx0XHRpZiAodGltZSAtIHRoaXMuX3RpbWVzWzBdID4gMjAwKSB7XG5cdFx0XHRcdHRoaXMuX3Bvc2l0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHR0aGlzLl90aW1lcy5zaGlmdCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX21hcFxuXHRcdCAgICAuZmlyZSgnbW92ZScpXG5cdFx0ICAgIC5maXJlKCdkcmFnJyk7XG5cdH0sXG5cblx0X29uVmlld1Jlc2V0OiBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVE9ETyBmaXggaGFyZGNvZGVkIEVhcnRoIHZhbHVlc1xuXHRcdHZhciBweENlbnRlciA9IHRoaXMuX21hcC5nZXRTaXplKCkuX2RpdmlkZUJ5KDIpLFxuXHRcdCAgICBweFdvcmxkQ2VudGVyID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludChbMCwgMF0pO1xuXG5cdFx0dGhpcy5faW5pdGlhbFdvcmxkT2Zmc2V0ID0gcHhXb3JsZENlbnRlci5zdWJ0cmFjdChweENlbnRlcikueDtcblx0XHR0aGlzLl93b3JsZFdpZHRoID0gdGhpcy5fbWFwLnByb2plY3QoWzAsIDE4MF0pLng7XG5cdH0sXG5cblx0X29uUHJlRHJhZzogZnVuY3Rpb24gKCkge1xuXHRcdC8vIFRPRE8gcmVmYWN0b3IgdG8gYmUgYWJsZSB0byBhZGp1c3QgbWFwIHBhbmUgcG9zaXRpb24gYWZ0ZXIgem9vbVxuXHRcdHZhciB3b3JsZFdpZHRoID0gdGhpcy5fd29ybGRXaWR0aCxcblx0XHQgICAgaGFsZldpZHRoID0gTWF0aC5yb3VuZCh3b3JsZFdpZHRoIC8gMiksXG5cdFx0ICAgIGR4ID0gdGhpcy5faW5pdGlhbFdvcmxkT2Zmc2V0LFxuXHRcdCAgICB4ID0gdGhpcy5fZHJhZ2dhYmxlLl9uZXdQb3MueCxcblx0XHQgICAgbmV3WDEgPSAoeCAtIGhhbGZXaWR0aCArIGR4KSAlIHdvcmxkV2lkdGggKyBoYWxmV2lkdGggLSBkeCxcblx0XHQgICAgbmV3WDIgPSAoeCArIGhhbGZXaWR0aCArIGR4KSAlIHdvcmxkV2lkdGggLSBoYWxmV2lkdGggLSBkeCxcblx0XHQgICAgbmV3WCA9IE1hdGguYWJzKG5ld1gxICsgZHgpIDwgTWF0aC5hYnMobmV3WDIgKyBkeCkgPyBuZXdYMSA6IG5ld1gyO1xuXG5cdFx0dGhpcy5fZHJhZ2dhYmxlLl9uZXdQb3MueCA9IG5ld1g7XG5cdH0sXG5cblx0X29uRHJhZ0VuZDogZnVuY3Rpb24gKGUpIHtcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwLFxuXHRcdCAgICBvcHRpb25zID0gbWFwLm9wdGlvbnMsXG5cdFx0ICAgIGRlbGF5ID0gK25ldyBEYXRlKCkgLSB0aGlzLl9sYXN0VGltZSxcblxuXHRcdCAgICBub0luZXJ0aWEgPSAhb3B0aW9ucy5pbmVydGlhIHx8IGRlbGF5ID4gb3B0aW9ucy5pbmVydGlhVGhyZXNob2xkIHx8ICF0aGlzLl9wb3NpdGlvbnNbMF07XG5cblx0XHRtYXAuZmlyZSgnZHJhZ2VuZCcsIGUpO1xuXG5cdFx0aWYgKG5vSW5lcnRpYSkge1xuXHRcdFx0bWFwLmZpcmUoJ21vdmVlbmQnKTtcblxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdHZhciBkaXJlY3Rpb24gPSB0aGlzLl9sYXN0UG9zLnN1YnRyYWN0KHRoaXMuX3Bvc2l0aW9uc1swXSksXG5cdFx0XHQgICAgZHVyYXRpb24gPSAodGhpcy5fbGFzdFRpbWUgKyBkZWxheSAtIHRoaXMuX3RpbWVzWzBdKSAvIDEwMDAsXG5cdFx0XHQgICAgZWFzZSA9IG9wdGlvbnMuZWFzZUxpbmVhcml0eSxcblxuXHRcdFx0ICAgIHNwZWVkVmVjdG9yID0gZGlyZWN0aW9uLm11bHRpcGx5QnkoZWFzZSAvIGR1cmF0aW9uKSxcblx0XHRcdCAgICBzcGVlZCA9IHNwZWVkVmVjdG9yLmRpc3RhbmNlVG8oWzAsIDBdKSxcblxuXHRcdFx0ICAgIGxpbWl0ZWRTcGVlZCA9IE1hdGgubWluKG9wdGlvbnMuaW5lcnRpYU1heFNwZWVkLCBzcGVlZCksXG5cdFx0XHQgICAgbGltaXRlZFNwZWVkVmVjdG9yID0gc3BlZWRWZWN0b3IubXVsdGlwbHlCeShsaW1pdGVkU3BlZWQgLyBzcGVlZCksXG5cblx0XHRcdCAgICBkZWNlbGVyYXRpb25EdXJhdGlvbiA9IGxpbWl0ZWRTcGVlZCAvIChvcHRpb25zLmluZXJ0aWFEZWNlbGVyYXRpb24gKiBlYXNlKSxcblx0XHRcdCAgICBvZmZzZXQgPSBsaW1pdGVkU3BlZWRWZWN0b3IubXVsdGlwbHlCeSgtZGVjZWxlcmF0aW9uRHVyYXRpb24gLyAyKS5yb3VuZCgpO1xuXG5cdFx0XHRpZiAoIW9mZnNldC54IHx8ICFvZmZzZXQueSkge1xuXHRcdFx0XHRtYXAuZmlyZSgnbW92ZWVuZCcpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvZmZzZXQgPSBtYXAuX2xpbWl0T2Zmc2V0KG9mZnNldCwgbWFwLm9wdGlvbnMubWF4Qm91bmRzKTtcblxuXHRcdFx0XHRMLlV0aWwucmVxdWVzdEFuaW1GcmFtZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0bWFwLnBhbkJ5KG9mZnNldCwge1xuXHRcdFx0XHRcdFx0ZHVyYXRpb246IGRlY2VsZXJhdGlvbkR1cmF0aW9uLFxuXHRcdFx0XHRcdFx0ZWFzZUxpbmVhcml0eTogZWFzZSxcblx0XHRcdFx0XHRcdG5vTW92ZVN0YXJ0OiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbkwuTWFwLmFkZEluaXRIb29rKCdhZGRIYW5kbGVyJywgJ2RyYWdnaW5nJywgTC5NYXAuRHJhZyk7XG5cblxuLypcbiAqIEwuSGFuZGxlci5Eb3VibGVDbGlja1pvb20gaXMgdXNlZCB0byBoYW5kbGUgZG91YmxlLWNsaWNrIHpvb20gb24gdGhlIG1hcCwgZW5hYmxlZCBieSBkZWZhdWx0LlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdGRvdWJsZUNsaWNrWm9vbTogdHJ1ZVxufSk7XG5cbkwuTWFwLkRvdWJsZUNsaWNrWm9vbSA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX21hcC5vbignZGJsY2xpY2snLCB0aGlzLl9vbkRvdWJsZUNsaWNrLCB0aGlzKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX21hcC5vZmYoJ2RibGNsaWNrJywgdGhpcy5fb25Eb3VibGVDbGljaywgdGhpcyk7XG5cdH0sXG5cblx0X29uRG91YmxlQ2xpY2s6IGZ1bmN0aW9uIChlKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcblx0XHQgICAgem9vbSA9IG1hcC5nZXRab29tKCkgKyAoZS5vcmlnaW5hbEV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKTtcblxuXHRcdGlmIChtYXAub3B0aW9ucy5kb3VibGVDbGlja1pvb20gPT09ICdjZW50ZXInKSB7XG5cdFx0XHRtYXAuc2V0Wm9vbSh6b29tKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWFwLnNldFpvb21Bcm91bmQoZS5jb250YWluZXJQb2ludCwgem9vbSk7XG5cdFx0fVxuXHR9XG59KTtcblxuTC5NYXAuYWRkSW5pdEhvb2soJ2FkZEhhbmRsZXInLCAnZG91YmxlQ2xpY2tab29tJywgTC5NYXAuRG91YmxlQ2xpY2tab29tKTtcblxuXG4vKlxuICogTC5IYW5kbGVyLlNjcm9sbFdoZWVsWm9vbSBpcyB1c2VkIGJ5IEwuTWFwIHRvIGVuYWJsZSBtb3VzZSBzY3JvbGwgd2hlZWwgem9vbSBvbiB0aGUgbWFwLlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdHNjcm9sbFdoZWVsWm9vbTogdHJ1ZVxufSk7XG5cbkwuTWFwLlNjcm9sbFdoZWVsWm9vbSA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub24odGhpcy5fbWFwLl9jb250YWluZXIsICdtb3VzZXdoZWVsJywgdGhpcy5fb25XaGVlbFNjcm9sbCwgdGhpcyk7XG5cdFx0TC5Eb21FdmVudC5vbih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KTtcblx0XHR0aGlzLl9kZWx0YSA9IDA7XG5cdH0sXG5cblx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ21vdXNld2hlZWwnLCB0aGlzLl9vbldoZWVsU2Nyb2xsKTtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KTtcblx0fSxcblxuXHRfb25XaGVlbFNjcm9sbDogZnVuY3Rpb24gKGUpIHtcblx0XHR2YXIgZGVsdGEgPSBMLkRvbUV2ZW50LmdldFdoZWVsRGVsdGEoZSk7XG5cblx0XHR0aGlzLl9kZWx0YSArPSBkZWx0YTtcblx0XHR0aGlzLl9sYXN0TW91c2VQb3MgPSB0aGlzLl9tYXAubW91c2VFdmVudFRvQ29udGFpbmVyUG9pbnQoZSk7XG5cblx0XHRpZiAoIXRoaXMuX3N0YXJ0VGltZSkge1xuXHRcdFx0dGhpcy5fc3RhcnRUaW1lID0gK25ldyBEYXRlKCk7XG5cdFx0fVxuXG5cdFx0dmFyIGxlZnQgPSBNYXRoLm1heCg0MCAtICgrbmV3IERhdGUoKSAtIHRoaXMuX3N0YXJ0VGltZSksIDApO1xuXG5cdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVyKTtcblx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoTC5iaW5kKHRoaXMuX3BlcmZvcm1ab29tLCB0aGlzKSwgbGVmdCk7XG5cblx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xuXHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xuXHR9LFxuXG5cdF9wZXJmb3JtWm9vbTogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXG5cdFx0ICAgIGRlbHRhID0gdGhpcy5fZGVsdGEsXG5cdFx0ICAgIHpvb20gPSBtYXAuZ2V0Wm9vbSgpO1xuXG5cdFx0ZGVsdGEgPSBkZWx0YSA+IDAgPyBNYXRoLmNlaWwoZGVsdGEpIDogTWF0aC5mbG9vcihkZWx0YSk7XG5cdFx0ZGVsdGEgPSBNYXRoLm1heChNYXRoLm1pbihkZWx0YSwgNCksIC00KTtcblx0XHRkZWx0YSA9IG1hcC5fbGltaXRab29tKHpvb20gKyBkZWx0YSkgLSB6b29tO1xuXG5cdFx0dGhpcy5fZGVsdGEgPSAwO1xuXHRcdHRoaXMuX3N0YXJ0VGltZSA9IG51bGw7XG5cblx0XHRpZiAoIWRlbHRhKSB7IHJldHVybjsgfVxuXG5cdFx0aWYgKG1hcC5vcHRpb25zLnNjcm9sbFdoZWVsWm9vbSA9PT0gJ2NlbnRlcicpIHtcblx0XHRcdG1hcC5zZXRab29tKHpvb20gKyBkZWx0YSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hcC5zZXRab29tQXJvdW5kKHRoaXMuX2xhc3RNb3VzZVBvcywgem9vbSArIGRlbHRhKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5MLk1hcC5hZGRJbml0SG9vaygnYWRkSGFuZGxlcicsICdzY3JvbGxXaGVlbFpvb20nLCBMLk1hcC5TY3JvbGxXaGVlbFpvb20pO1xuXG5cbi8qXHJcbiAqIEV4dGVuZHMgdGhlIGV2ZW50IGhhbmRsaW5nIGNvZGUgd2l0aCBkb3VibGUgdGFwIHN1cHBvcnQgZm9yIG1vYmlsZSBicm93c2Vycy5cclxuICovXHJcblxyXG5MLmV4dGVuZChMLkRvbUV2ZW50LCB7XHJcblxyXG5cdF90b3VjaHN0YXJ0OiBMLkJyb3dzZXIubXNQb2ludGVyID8gJ01TUG9pbnRlckRvd24nIDogTC5Ccm93c2VyLnBvaW50ZXIgPyAncG9pbnRlcmRvd24nIDogJ3RvdWNoc3RhcnQnLFxyXG5cdF90b3VjaGVuZDogTC5Ccm93c2VyLm1zUG9pbnRlciA/ICdNU1BvaW50ZXJVcCcgOiBMLkJyb3dzZXIucG9pbnRlciA/ICdwb2ludGVydXAnIDogJ3RvdWNoZW5kJyxcclxuXHJcblx0Ly8gaW5zcGlyZWQgYnkgWmVwdG8gdG91Y2ggY29kZSBieSBUaG9tYXMgRnVjaHNcclxuXHRhZGREb3VibGVUYXBMaXN0ZW5lcjogZnVuY3Rpb24gKG9iaiwgaGFuZGxlciwgaWQpIHtcclxuXHRcdHZhciBsYXN0LFxyXG5cdFx0ICAgIGRvdWJsZVRhcCA9IGZhbHNlLFxyXG5cdFx0ICAgIGRlbGF5ID0gMjUwLFxyXG5cdFx0ICAgIHRvdWNoLFxyXG5cdFx0ICAgIHByZSA9ICdfbGVhZmxldF8nLFxyXG5cdFx0ICAgIHRvdWNoc3RhcnQgPSB0aGlzLl90b3VjaHN0YXJ0LFxyXG5cdFx0ICAgIHRvdWNoZW5kID0gdGhpcy5fdG91Y2hlbmQsXHJcblx0XHQgICAgdHJhY2tlZFRvdWNoZXMgPSBbXTtcclxuXHJcblx0XHRmdW5jdGlvbiBvblRvdWNoU3RhcnQoZSkge1xyXG5cdFx0XHR2YXIgY291bnQ7XHJcblxyXG5cdFx0XHRpZiAoTC5Ccm93c2VyLnBvaW50ZXIpIHtcclxuXHRcdFx0XHR0cmFja2VkVG91Y2hlcy5wdXNoKGUucG9pbnRlcklkKTtcclxuXHRcdFx0XHRjb3VudCA9IHRyYWNrZWRUb3VjaGVzLmxlbmd0aDtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRjb3VudCA9IGUudG91Y2hlcy5sZW5ndGg7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKGNvdW50ID4gMSkge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFyIG5vdyA9IERhdGUubm93KCksXHJcblx0XHRcdFx0ZGVsdGEgPSBub3cgLSAobGFzdCB8fCBub3cpO1xyXG5cclxuXHRcdFx0dG91Y2ggPSBlLnRvdWNoZXMgPyBlLnRvdWNoZXNbMF0gOiBlO1xyXG5cdFx0XHRkb3VibGVUYXAgPSAoZGVsdGEgPiAwICYmIGRlbHRhIDw9IGRlbGF5KTtcclxuXHRcdFx0bGFzdCA9IG5vdztcclxuXHRcdH1cclxuXHJcblx0XHRmdW5jdGlvbiBvblRvdWNoRW5kKGUpIHtcclxuXHRcdFx0aWYgKEwuQnJvd3Nlci5wb2ludGVyKSB7XHJcblx0XHRcdFx0dmFyIGlkeCA9IHRyYWNrZWRUb3VjaGVzLmluZGV4T2YoZS5wb2ludGVySWQpO1xyXG5cdFx0XHRcdGlmIChpZHggPT09IC0xKSB7XHJcblx0XHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHRyYWNrZWRUb3VjaGVzLnNwbGljZShpZHgsIDEpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAoZG91YmxlVGFwKSB7XHJcblx0XHRcdFx0aWYgKEwuQnJvd3Nlci5wb2ludGVyKSB7XHJcblx0XHRcdFx0XHQvLyB3b3JrIGFyb3VuZCAudHlwZSBiZWluZyByZWFkb25seSB3aXRoIE1TUG9pbnRlciogZXZlbnRzXHJcblx0XHRcdFx0XHR2YXIgbmV3VG91Y2ggPSB7IH0sXHJcblx0XHRcdFx0XHRcdHByb3A7XHJcblxyXG5cdFx0XHRcdFx0Ly8ganNoaW50IGZvcmluOmZhbHNlXHJcblx0XHRcdFx0XHRmb3IgKHZhciBpIGluIHRvdWNoKSB7XHJcblx0XHRcdFx0XHRcdHByb3AgPSB0b3VjaFtpXTtcclxuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBwcm9wID09PSAnZnVuY3Rpb24nKSB7XHJcblx0XHRcdFx0XHRcdFx0bmV3VG91Y2hbaV0gPSBwcm9wLmJpbmQodG91Y2gpO1xyXG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRcdG5ld1RvdWNoW2ldID0gcHJvcDtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0dG91Y2ggPSBuZXdUb3VjaDtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0dG91Y2gudHlwZSA9ICdkYmxjbGljayc7XHJcblx0XHRcdFx0aGFuZGxlcih0b3VjaCk7XHJcblx0XHRcdFx0bGFzdCA9IG51bGw7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdG9ialtwcmUgKyB0b3VjaHN0YXJ0ICsgaWRdID0gb25Ub3VjaFN0YXJ0O1xyXG5cdFx0b2JqW3ByZSArIHRvdWNoZW5kICsgaWRdID0gb25Ub3VjaEVuZDtcclxuXHJcblx0XHQvLyBvbiBwb2ludGVyIHdlIG5lZWQgdG8gbGlzdGVuIG9uIHRoZSBkb2N1bWVudCwgb3RoZXJ3aXNlIGEgZHJhZyBzdGFydGluZyBvbiB0aGUgbWFwIGFuZCBtb3Zpbmcgb2ZmIHNjcmVlblxyXG5cdFx0Ly8gd2lsbCBub3QgY29tZSB0aHJvdWdoIHRvIHVzLCBzbyB3ZSB3aWxsIGxvc2UgdHJhY2sgb2YgaG93IG1hbnkgdG91Y2hlcyBhcmUgb25nb2luZ1xyXG5cdFx0dmFyIGVuZEVsZW1lbnQgPSBMLkJyb3dzZXIucG9pbnRlciA/IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCA6IG9iajtcclxuXHJcblx0XHRvYmouYWRkRXZlbnRMaXN0ZW5lcih0b3VjaHN0YXJ0LCBvblRvdWNoU3RhcnQsIGZhbHNlKTtcclxuXHRcdGVuZEVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcih0b3VjaGVuZCwgb25Ub3VjaEVuZCwgZmFsc2UpO1xyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIucG9pbnRlcikge1xyXG5cdFx0XHRlbmRFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoTC5Eb21FdmVudC5QT0lOVEVSX0NBTkNFTCwgb25Ub3VjaEVuZCwgZmFsc2UpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHJlbW92ZURvdWJsZVRhcExpc3RlbmVyOiBmdW5jdGlvbiAob2JqLCBpZCkge1xyXG5cdFx0dmFyIHByZSA9ICdfbGVhZmxldF8nO1xyXG5cclxuXHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuX3RvdWNoc3RhcnQsIG9ialtwcmUgKyB0aGlzLl90b3VjaHN0YXJ0ICsgaWRdLCBmYWxzZSk7XHJcblx0XHQoTC5Ccm93c2VyLnBvaW50ZXIgPyBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgOiBvYmopLnJlbW92ZUV2ZW50TGlzdGVuZXIoXHJcblx0XHQgICAgICAgIHRoaXMuX3RvdWNoZW5kLCBvYmpbcHJlICsgdGhpcy5fdG91Y2hlbmQgKyBpZF0sIGZhbHNlKTtcclxuXHJcblx0XHRpZiAoTC5Ccm93c2VyLnBvaW50ZXIpIHtcclxuXHRcdFx0ZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoTC5Eb21FdmVudC5QT0lOVEVSX0NBTkNFTCwgb2JqW3ByZSArIHRoaXMuX3RvdWNoZW5kICsgaWRdLFxyXG5cdFx0XHRcdGZhbHNlKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcbiAqIEV4dGVuZHMgTC5Eb21FdmVudCB0byBwcm92aWRlIHRvdWNoIHN1cHBvcnQgZm9yIEludGVybmV0IEV4cGxvcmVyIGFuZCBXaW5kb3dzLWJhc2VkIGRldmljZXMuXG4gKi9cblxuTC5leHRlbmQoTC5Eb21FdmVudCwge1xuXG5cdC8vc3RhdGljXG5cdFBPSU5URVJfRE9XTjogTC5Ccm93c2VyLm1zUG9pbnRlciA/ICdNU1BvaW50ZXJEb3duJyA6ICdwb2ludGVyZG93bicsXG5cdFBPSU5URVJfTU9WRTogTC5Ccm93c2VyLm1zUG9pbnRlciA/ICdNU1BvaW50ZXJNb3ZlJyA6ICdwb2ludGVybW92ZScsXG5cdFBPSU5URVJfVVA6IEwuQnJvd3Nlci5tc1BvaW50ZXIgPyAnTVNQb2ludGVyVXAnIDogJ3BvaW50ZXJ1cCcsXG5cdFBPSU5URVJfQ0FOQ0VMOiBMLkJyb3dzZXIubXNQb2ludGVyID8gJ01TUG9pbnRlckNhbmNlbCcgOiAncG9pbnRlcmNhbmNlbCcsXG5cblx0X3BvaW50ZXJzOiBbXSxcblx0X3BvaW50ZXJEb2N1bWVudExpc3RlbmVyOiBmYWxzZSxcblxuXHQvLyBQcm92aWRlcyBhIHRvdWNoIGV2ZW50cyB3cmFwcGVyIGZvciAobXMpcG9pbnRlciBldmVudHMuXG5cdC8vIEJhc2VkIG9uIGNoYW5nZXMgYnkgdmVwcm96YSBodHRwczovL2dpdGh1Yi5jb20vQ2xvdWRNYWRlL0xlYWZsZXQvcHVsbC8xMDE5XG5cdC8vcmVmIGh0dHA6Ly93d3cudzMub3JnL1RSL3BvaW50ZXJldmVudHMvIGh0dHBzOi8vd3d3LnczLm9yZy9CdWdzL1B1YmxpYy9zaG93X2J1Zy5jZ2k/aWQ9MjI4OTBcblxuXHRhZGRQb2ludGVyTGlzdGVuZXI6IGZ1bmN0aW9uIChvYmosIHR5cGUsIGhhbmRsZXIsIGlkKSB7XG5cblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlICd0b3VjaHN0YXJ0Jzpcblx0XHRcdHJldHVybiB0aGlzLmFkZFBvaW50ZXJMaXN0ZW5lclN0YXJ0KG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpO1xuXHRcdGNhc2UgJ3RvdWNoZW5kJzpcblx0XHRcdHJldHVybiB0aGlzLmFkZFBvaW50ZXJMaXN0ZW5lckVuZChvYmosIHR5cGUsIGhhbmRsZXIsIGlkKTtcblx0XHRjYXNlICd0b3VjaG1vdmUnOlxuXHRcdFx0cmV0dXJuIHRoaXMuYWRkUG9pbnRlckxpc3RlbmVyTW92ZShvYmosIHR5cGUsIGhhbmRsZXIsIGlkKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgJ1Vua25vd24gdG91Y2ggZXZlbnQgdHlwZSc7XG5cdFx0fVxuXHR9LFxuXG5cdGFkZFBvaW50ZXJMaXN0ZW5lclN0YXJ0OiBmdW5jdGlvbiAob2JqLCB0eXBlLCBoYW5kbGVyLCBpZCkge1xuXHRcdHZhciBwcmUgPSAnX2xlYWZsZXRfJyxcblx0XHQgICAgcG9pbnRlcnMgPSB0aGlzLl9wb2ludGVycztcblxuXHRcdHZhciBjYiA9IGZ1bmN0aW9uIChlKSB7XG5cblx0XHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XG5cblx0XHRcdHZhciBhbHJlYWR5SW5BcnJheSA9IGZhbHNlO1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBwb2ludGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAocG9pbnRlcnNbaV0ucG9pbnRlcklkID09PSBlLnBvaW50ZXJJZCkge1xuXHRcdFx0XHRcdGFscmVhZHlJbkFycmF5ID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFhbHJlYWR5SW5BcnJheSkge1xuXHRcdFx0XHRwb2ludGVycy5wdXNoKGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRlLnRvdWNoZXMgPSBwb2ludGVycy5zbGljZSgpO1xuXHRcdFx0ZS5jaGFuZ2VkVG91Y2hlcyA9IFtlXTtcblxuXHRcdFx0aGFuZGxlcihlKTtcblx0XHR9O1xuXG5cdFx0b2JqW3ByZSArICd0b3VjaHN0YXJ0JyArIGlkXSA9IGNiO1xuXHRcdG9iai5hZGRFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9ET1dOLCBjYiwgZmFsc2UpO1xuXG5cdFx0Ly8gbmVlZCB0byBhbHNvIGxpc3RlbiBmb3IgZW5kIGV2ZW50cyB0byBrZWVwIHRoZSBfcG9pbnRlcnMgbGlzdCBhY2N1cmF0ZVxuXHRcdC8vIHRoaXMgbmVlZHMgdG8gYmUgb24gdGhlIGJvZHkgYW5kIG5ldmVyIGdvIGF3YXlcblx0XHRpZiAoIXRoaXMuX3BvaW50ZXJEb2N1bWVudExpc3RlbmVyKSB7XG5cdFx0XHR2YXIgaW50ZXJuYWxDYiA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgcG9pbnRlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAocG9pbnRlcnNbaV0ucG9pbnRlcklkID09PSBlLnBvaW50ZXJJZCkge1xuXHRcdFx0XHRcdFx0cG9pbnRlcnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Ly9XZSBsaXN0ZW4gb24gdGhlIGRvY3VtZW50RWxlbWVudCBhcyBhbnkgZHJhZ3MgdGhhdCBlbmQgYnkgbW92aW5nIHRoZSB0b3VjaCBvZmYgdGhlIHNjcmVlbiBnZXQgZmlyZWQgdGhlcmVcblx0XHRcdGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9VUCwgaW50ZXJuYWxDYiwgZmFsc2UpO1xuXHRcdFx0ZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIodGhpcy5QT0lOVEVSX0NBTkNFTCwgaW50ZXJuYWxDYiwgZmFsc2UpO1xuXG5cdFx0XHR0aGlzLl9wb2ludGVyRG9jdW1lbnRMaXN0ZW5lciA9IHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkUG9pbnRlckxpc3RlbmVyTW92ZTogZnVuY3Rpb24gKG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpIHtcblx0XHR2YXIgcHJlID0gJ19sZWFmbGV0XycsXG5cdFx0ICAgIHRvdWNoZXMgPSB0aGlzLl9wb2ludGVycztcblxuXHRcdGZ1bmN0aW9uIGNiKGUpIHtcblxuXHRcdFx0Ly8gZG9uJ3QgZmlyZSB0b3VjaCBtb3ZlcyB3aGVuIG1vdXNlIGlzbid0IGRvd25cblx0XHRcdGlmICgoZS5wb2ludGVyVHlwZSA9PT0gZS5NU1BPSU5URVJfVFlQRV9NT1VTRSB8fCBlLnBvaW50ZXJUeXBlID09PSAnbW91c2UnKSAmJiBlLmJ1dHRvbnMgPT09IDApIHsgcmV0dXJuOyB9XG5cblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgdG91Y2hlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodG91Y2hlc1tpXS5wb2ludGVySWQgPT09IGUucG9pbnRlcklkKSB7XG5cdFx0XHRcdFx0dG91Y2hlc1tpXSA9IGU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZS50b3VjaGVzID0gdG91Y2hlcy5zbGljZSgpO1xuXHRcdFx0ZS5jaGFuZ2VkVG91Y2hlcyA9IFtlXTtcblxuXHRcdFx0aGFuZGxlcihlKTtcblx0XHR9XG5cblx0XHRvYmpbcHJlICsgJ3RvdWNobW92ZScgKyBpZF0gPSBjYjtcblx0XHRvYmouYWRkRXZlbnRMaXN0ZW5lcih0aGlzLlBPSU5URVJfTU9WRSwgY2IsIGZhbHNlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFkZFBvaW50ZXJMaXN0ZW5lckVuZDogZnVuY3Rpb24gKG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpIHtcblx0XHR2YXIgcHJlID0gJ19sZWFmbGV0XycsXG5cdFx0ICAgIHRvdWNoZXMgPSB0aGlzLl9wb2ludGVycztcblxuXHRcdHZhciBjYiA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHRvdWNoZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRvdWNoZXNbaV0ucG9pbnRlcklkID09PSBlLnBvaW50ZXJJZCkge1xuXHRcdFx0XHRcdHRvdWNoZXMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGUudG91Y2hlcyA9IHRvdWNoZXMuc2xpY2UoKTtcblx0XHRcdGUuY2hhbmdlZFRvdWNoZXMgPSBbZV07XG5cblx0XHRcdGhhbmRsZXIoZSk7XG5cdFx0fTtcblxuXHRcdG9ialtwcmUgKyAndG91Y2hlbmQnICsgaWRdID0gY2I7XG5cdFx0b2JqLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5QT0lOVEVSX1VQLCBjYiwgZmFsc2UpO1xuXHRcdG9iai5hZGRFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9DQU5DRUwsIGNiLCBmYWxzZSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVQb2ludGVyTGlzdGVuZXI6IGZ1bmN0aW9uIChvYmosIHR5cGUsIGlkKSB7XG5cdFx0dmFyIHByZSA9ICdfbGVhZmxldF8nLFxuXHRcdCAgICBjYiA9IG9ialtwcmUgKyB0eXBlICsgaWRdO1xuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSAndG91Y2hzdGFydCc6XG5cdFx0XHRvYmoucmVtb3ZlRXZlbnRMaXN0ZW5lcih0aGlzLlBPSU5URVJfRE9XTiwgY2IsIGZhbHNlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3RvdWNobW92ZSc6XG5cdFx0XHRvYmoucmVtb3ZlRXZlbnRMaXN0ZW5lcih0aGlzLlBPSU5URVJfTU9WRSwgY2IsIGZhbHNlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3RvdWNoZW5kJzpcblx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9VUCwgY2IsIGZhbHNlKTtcblx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9DQU5DRUwsIGNiLCBmYWxzZSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxufSk7XG5cblxuLypcbiAqIEwuSGFuZGxlci5Ub3VjaFpvb20gaXMgdXNlZCBieSBMLk1hcCB0byBhZGQgcGluY2ggem9vbSBvbiBzdXBwb3J0ZWQgbW9iaWxlIGJyb3dzZXJzLlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdHRvdWNoWm9vbTogTC5Ccm93c2VyLnRvdWNoICYmICFMLkJyb3dzZXIuYW5kcm9pZDIzLFxuXHRib3VuY2VBdFpvb21MaW1pdHM6IHRydWVcbn0pO1xuXG5MLk1hcC5Ub3VjaFpvb20gPSBMLkhhbmRsZXIuZXh0ZW5kKHtcblx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9uKHRoaXMuX21hcC5fY29udGFpbmVyLCAndG91Y2hzdGFydCcsIHRoaXMuX29uVG91Y2hTdGFydCwgdGhpcyk7XG5cdH0sXG5cblx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ3RvdWNoc3RhcnQnLCB0aGlzLl9vblRvdWNoU3RhcnQsIHRoaXMpO1xuXHR9LFxuXG5cdF9vblRvdWNoU3RhcnQ6IGZ1bmN0aW9uIChlKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcDtcblxuXHRcdGlmICghZS50b3VjaGVzIHx8IGUudG91Y2hlcy5sZW5ndGggIT09IDIgfHwgbWFwLl9hbmltYXRpbmdab29tIHx8IHRoaXMuX3pvb21pbmcpIHsgcmV0dXJuOyB9XG5cblx0XHR2YXIgcDEgPSBtYXAubW91c2VFdmVudFRvTGF5ZXJQb2ludChlLnRvdWNoZXNbMF0pLFxuXHRcdCAgICBwMiA9IG1hcC5tb3VzZUV2ZW50VG9MYXllclBvaW50KGUudG91Y2hlc1sxXSksXG5cdFx0ICAgIHZpZXdDZW50ZXIgPSBtYXAuX2dldENlbnRlckxheWVyUG9pbnQoKTtcblxuXHRcdHRoaXMuX3N0YXJ0Q2VudGVyID0gcDEuYWRkKHAyKS5fZGl2aWRlQnkoMik7XG5cdFx0dGhpcy5fc3RhcnREaXN0ID0gcDEuZGlzdGFuY2VUbyhwMik7XG5cblx0XHR0aGlzLl9tb3ZlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3pvb21pbmcgPSB0cnVlO1xuXG5cdFx0dGhpcy5fY2VudGVyT2Zmc2V0ID0gdmlld0NlbnRlci5zdWJ0cmFjdCh0aGlzLl9zdGFydENlbnRlcik7XG5cblx0XHRpZiAobWFwLl9wYW5BbmltKSB7XG5cdFx0XHRtYXAuX3BhbkFuaW0uc3RvcCgpO1xuXHRcdH1cblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9uKGRvY3VtZW50LCAndG91Y2htb3ZlJywgdGhpcy5fb25Ub3VjaE1vdmUsIHRoaXMpXG5cdFx0ICAgIC5vbihkb2N1bWVudCwgJ3RvdWNoZW5kJywgdGhpcy5fb25Ub3VjaEVuZCwgdGhpcyk7XG5cblx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xuXHR9LFxuXG5cdF9vblRvdWNoTW92ZTogZnVuY3Rpb24gKGUpIHtcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwO1xuXG5cdFx0aWYgKCFlLnRvdWNoZXMgfHwgZS50b3VjaGVzLmxlbmd0aCAhPT0gMiB8fCAhdGhpcy5fem9vbWluZykgeyByZXR1cm47IH1cblxuXHRcdHZhciBwMSA9IG1hcC5tb3VzZUV2ZW50VG9MYXllclBvaW50KGUudG91Y2hlc1swXSksXG5cdFx0ICAgIHAyID0gbWFwLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZS50b3VjaGVzWzFdKTtcblxuXHRcdHRoaXMuX3NjYWxlID0gcDEuZGlzdGFuY2VUbyhwMikgLyB0aGlzLl9zdGFydERpc3Q7XG5cdFx0dGhpcy5fZGVsdGEgPSBwMS5fYWRkKHAyKS5fZGl2aWRlQnkoMikuX3N1YnRyYWN0KHRoaXMuX3N0YXJ0Q2VudGVyKTtcblxuXHRcdGlmICh0aGlzLl9zY2FsZSA9PT0gMSkgeyByZXR1cm47IH1cblxuXHRcdGlmICghbWFwLm9wdGlvbnMuYm91bmNlQXRab29tTGltaXRzKSB7XG5cdFx0XHRpZiAoKG1hcC5nZXRab29tKCkgPT09IG1hcC5nZXRNaW5ab29tKCkgJiYgdGhpcy5fc2NhbGUgPCAxKSB8fFxuXHRcdFx0ICAgIChtYXAuZ2V0Wm9vbSgpID09PSBtYXAuZ2V0TWF4Wm9vbSgpICYmIHRoaXMuX3NjYWxlID4gMSkpIHsgcmV0dXJuOyB9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCkge1xuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKG1hcC5fbWFwUGFuZSwgJ2xlYWZsZXQtdG91Y2hpbmcnKTtcblxuXHRcdFx0bWFwXG5cdFx0XHQgICAgLmZpcmUoJ21vdmVzdGFydCcpXG5cdFx0XHQgICAgLmZpcmUoJ3pvb21zdGFydCcpO1xuXG5cdFx0XHR0aGlzLl9tb3ZlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0TC5VdGlsLmNhbmNlbEFuaW1GcmFtZSh0aGlzLl9hbmltUmVxdWVzdCk7XG5cdFx0dGhpcy5fYW5pbVJlcXVlc3QgPSBMLlV0aWwucmVxdWVzdEFuaW1GcmFtZShcblx0XHQgICAgICAgIHRoaXMuX3VwZGF0ZU9uTW92ZSwgdGhpcywgdHJ1ZSwgdGhpcy5fbWFwLl9jb250YWluZXIpO1xuXG5cdFx0TC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdChlKTtcblx0fSxcblxuXHRfdXBkYXRlT25Nb3ZlOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcblx0XHQgICAgb3JpZ2luID0gdGhpcy5fZ2V0U2NhbGVPcmlnaW4oKSxcblx0XHQgICAgY2VudGVyID0gbWFwLmxheWVyUG9pbnRUb0xhdExuZyhvcmlnaW4pLFxuXHRcdCAgICB6b29tID0gbWFwLmdldFNjYWxlWm9vbSh0aGlzLl9zY2FsZSk7XG5cblx0XHRtYXAuX2FuaW1hdGVab29tKGNlbnRlciwgem9vbSwgdGhpcy5fc3RhcnRDZW50ZXIsIHRoaXMuX3NjYWxlLCB0aGlzLl9kZWx0YSwgZmFsc2UsIHRydWUpO1xuXHR9LFxuXG5cdF9vblRvdWNoRW5kOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCB8fCAhdGhpcy5fem9vbWluZykge1xuXHRcdFx0dGhpcy5fem9vbWluZyA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXA7XG5cblx0XHR0aGlzLl96b29taW5nID0gZmFsc2U7XG5cdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKG1hcC5fbWFwUGFuZSwgJ2xlYWZsZXQtdG91Y2hpbmcnKTtcblx0XHRMLlV0aWwuY2FuY2VsQW5pbUZyYW1lKHRoaXMuX2FuaW1SZXF1ZXN0KTtcblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9mZihkb2N1bWVudCwgJ3RvdWNobW92ZScsIHRoaXMuX29uVG91Y2hNb3ZlKVxuXHRcdCAgICAub2ZmKGRvY3VtZW50LCAndG91Y2hlbmQnLCB0aGlzLl9vblRvdWNoRW5kKTtcblxuXHRcdHZhciBvcmlnaW4gPSB0aGlzLl9nZXRTY2FsZU9yaWdpbigpLFxuXHRcdCAgICBjZW50ZXIgPSBtYXAubGF5ZXJQb2ludFRvTGF0TG5nKG9yaWdpbiksXG5cblx0XHQgICAgb2xkWm9vbSA9IG1hcC5nZXRab29tKCksXG5cdFx0ICAgIGZsb2F0Wm9vbURlbHRhID0gbWFwLmdldFNjYWxlWm9vbSh0aGlzLl9zY2FsZSkgLSBvbGRab29tLFxuXHRcdCAgICByb3VuZFpvb21EZWx0YSA9IChmbG9hdFpvb21EZWx0YSA+IDAgP1xuXHRcdCAgICAgICAgICAgIE1hdGguY2VpbChmbG9hdFpvb21EZWx0YSkgOiBNYXRoLmZsb29yKGZsb2F0Wm9vbURlbHRhKSksXG5cblx0XHQgICAgem9vbSA9IG1hcC5fbGltaXRab29tKG9sZFpvb20gKyByb3VuZFpvb21EZWx0YSksXG5cdFx0ICAgIHNjYWxlID0gbWFwLmdldFpvb21TY2FsZSh6b29tKSAvIHRoaXMuX3NjYWxlO1xuXG5cdFx0bWFwLl9hbmltYXRlWm9vbShjZW50ZXIsIHpvb20sIG9yaWdpbiwgc2NhbGUpO1xuXHR9LFxuXG5cdF9nZXRTY2FsZU9yaWdpbjogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBjZW50ZXJPZmZzZXQgPSB0aGlzLl9jZW50ZXJPZmZzZXQuc3VidHJhY3QodGhpcy5fZGVsdGEpLmRpdmlkZUJ5KHRoaXMuX3NjYWxlKTtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRDZW50ZXIuYWRkKGNlbnRlck9mZnNldCk7XG5cdH1cbn0pO1xuXG5MLk1hcC5hZGRJbml0SG9vaygnYWRkSGFuZGxlcicsICd0b3VjaFpvb20nLCBMLk1hcC5Ub3VjaFpvb20pO1xuXG5cbi8qXG4gKiBMLk1hcC5UYXAgaXMgdXNlZCB0byBlbmFibGUgbW9iaWxlIGhhY2tzIGxpa2UgcXVpY2sgdGFwcyBhbmQgbG9uZyBob2xkLlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdHRhcDogdHJ1ZSxcblx0dGFwVG9sZXJhbmNlOiAxNVxufSk7XG5cbkwuTWFwLlRhcCA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub24odGhpcy5fbWFwLl9jb250YWluZXIsICd0b3VjaHN0YXJ0JywgdGhpcy5fb25Eb3duLCB0aGlzKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub2ZmKHRoaXMuX21hcC5fY29udGFpbmVyLCAndG91Y2hzdGFydCcsIHRoaXMuX29uRG93biwgdGhpcyk7XG5cdH0sXG5cblx0X29uRG93bjogZnVuY3Rpb24gKGUpIHtcblx0XHRpZiAoIWUudG91Y2hlcykgeyByZXR1cm47IH1cblxuXHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XG5cblx0XHR0aGlzLl9maXJlQ2xpY2sgPSB0cnVlO1xuXG5cdFx0Ly8gZG9uJ3Qgc2ltdWxhdGUgY2xpY2sgb3IgdHJhY2sgbG9uZ3ByZXNzIGlmIG1vcmUgdGhhbiAxIHRvdWNoXG5cdFx0aWYgKGUudG91Y2hlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLl9maXJlQ2xpY2sgPSBmYWxzZTtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9ob2xkVGltZW91dCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmFyIGZpcnN0ID0gZS50b3VjaGVzWzBdLFxuXHRcdCAgICBlbCA9IGZpcnN0LnRhcmdldDtcblxuXHRcdHRoaXMuX3N0YXJ0UG9zID0gdGhpcy5fbmV3UG9zID0gbmV3IEwuUG9pbnQoZmlyc3QuY2xpZW50WCwgZmlyc3QuY2xpZW50WSk7XG5cblx0XHQvLyBpZiB0b3VjaGluZyBhIGxpbmssIGhpZ2hsaWdodCBpdFxuXHRcdGlmIChlbC50YWdOYW1lICYmIGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2EnKSB7XG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MoZWwsICdsZWFmbGV0LWFjdGl2ZScpO1xuXHRcdH1cblxuXHRcdC8vIHNpbXVsYXRlIGxvbmcgaG9sZCBidXQgc2V0dGluZyBhIHRpbWVvdXRcblx0XHR0aGlzLl9ob2xkVGltZW91dCA9IHNldFRpbWVvdXQoTC5iaW5kKGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLl9pc1RhcFZhbGlkKCkpIHtcblx0XHRcdFx0dGhpcy5fZmlyZUNsaWNrID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX29uVXAoKTtcblx0XHRcdFx0dGhpcy5fc2ltdWxhdGVFdmVudCgnY29udGV4dG1lbnUnLCBmaXJzdCk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcyksIDEwMDApO1xuXG5cdFx0TC5Eb21FdmVudFxuXHRcdFx0Lm9uKGRvY3VtZW50LCAndG91Y2htb3ZlJywgdGhpcy5fb25Nb3ZlLCB0aGlzKVxuXHRcdFx0Lm9uKGRvY3VtZW50LCAndG91Y2hlbmQnLCB0aGlzLl9vblVwLCB0aGlzKTtcblx0fSxcblxuXHRfb25VcDogZnVuY3Rpb24gKGUpIHtcblx0XHRjbGVhclRpbWVvdXQodGhpcy5faG9sZFRpbWVvdXQpO1xuXG5cdFx0TC5Eb21FdmVudFxuXHRcdFx0Lm9mZihkb2N1bWVudCwgJ3RvdWNobW92ZScsIHRoaXMuX29uTW92ZSwgdGhpcylcblx0XHRcdC5vZmYoZG9jdW1lbnQsICd0b3VjaGVuZCcsIHRoaXMuX29uVXAsIHRoaXMpO1xuXG5cdFx0aWYgKHRoaXMuX2ZpcmVDbGljayAmJiBlICYmIGUuY2hhbmdlZFRvdWNoZXMpIHtcblxuXHRcdFx0dmFyIGZpcnN0ID0gZS5jaGFuZ2VkVG91Y2hlc1swXSxcblx0XHRcdCAgICBlbCA9IGZpcnN0LnRhcmdldDtcblxuXHRcdFx0aWYgKGVsICYmIGVsLnRhZ05hbWUgJiYgZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnYScpIHtcblx0XHRcdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKGVsLCAnbGVhZmxldC1hY3RpdmUnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2ltdWxhdGUgY2xpY2sgaWYgdGhlIHRvdWNoIGRpZG4ndCBtb3ZlIHRvbyBtdWNoXG5cdFx0XHRpZiAodGhpcy5faXNUYXBWYWxpZCgpKSB7XG5cdFx0XHRcdHRoaXMuX3NpbXVsYXRlRXZlbnQoJ2NsaWNrJywgZmlyc3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHRfaXNUYXBWYWxpZDogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzLl9uZXdQb3MuZGlzdGFuY2VUbyh0aGlzLl9zdGFydFBvcykgPD0gdGhpcy5fbWFwLm9wdGlvbnMudGFwVG9sZXJhbmNlO1xuXHR9LFxuXG5cdF9vbk1vdmU6IGZ1bmN0aW9uIChlKSB7XG5cdFx0dmFyIGZpcnN0ID0gZS50b3VjaGVzWzBdO1xuXHRcdHRoaXMuX25ld1BvcyA9IG5ldyBMLlBvaW50KGZpcnN0LmNsaWVudFgsIGZpcnN0LmNsaWVudFkpO1xuXHR9LFxuXG5cdF9zaW11bGF0ZUV2ZW50OiBmdW5jdGlvbiAodHlwZSwgZSkge1xuXHRcdHZhciBzaW11bGF0ZWRFdmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdNb3VzZUV2ZW50cycpO1xuXG5cdFx0c2ltdWxhdGVkRXZlbnQuX3NpbXVsYXRlZCA9IHRydWU7XG5cdFx0ZS50YXJnZXQuX3NpbXVsYXRlZENsaWNrID0gdHJ1ZTtcblxuXHRcdHNpbXVsYXRlZEV2ZW50LmluaXRNb3VzZUV2ZW50KFxuXHRcdCAgICAgICAgdHlwZSwgdHJ1ZSwgdHJ1ZSwgd2luZG93LCAxLFxuXHRcdCAgICAgICAgZS5zY3JlZW5YLCBlLnNjcmVlblksXG5cdFx0ICAgICAgICBlLmNsaWVudFgsIGUuY2xpZW50WSxcblx0XHQgICAgICAgIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCAwLCBudWxsKTtcblxuXHRcdGUudGFyZ2V0LmRpc3BhdGNoRXZlbnQoc2ltdWxhdGVkRXZlbnQpO1xuXHR9XG59KTtcblxuaWYgKEwuQnJvd3Nlci50b3VjaCAmJiAhTC5Ccm93c2VyLnBvaW50ZXIpIHtcblx0TC5NYXAuYWRkSW5pdEhvb2soJ2FkZEhhbmRsZXInLCAndGFwJywgTC5NYXAuVGFwKTtcbn1cblxuXG4vKlxuICogTC5IYW5kbGVyLlNoaWZ0RHJhZ1pvb20gaXMgdXNlZCB0byBhZGQgc2hpZnQtZHJhZyB6b29tIGludGVyYWN0aW9uIHRvIHRoZSBtYXBcbiAgKiAoem9vbSB0byBhIHNlbGVjdGVkIGJvdW5kaW5nIGJveCksIGVuYWJsZWQgYnkgZGVmYXVsdC5cbiAqL1xuXG5MLk1hcC5tZXJnZU9wdGlvbnMoe1xuXHRib3hab29tOiB0cnVlXG59KTtcblxuTC5NYXAuQm94Wm9vbSA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobWFwKSB7XG5cdFx0dGhpcy5fbWFwID0gbWFwO1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IG1hcC5fY29udGFpbmVyO1xuXHRcdHRoaXMuX3BhbmUgPSBtYXAuX3BhbmVzLm92ZXJsYXlQYW5lO1xuXHRcdHRoaXMuX21vdmVkID0gZmFsc2U7XG5cdH0sXG5cblx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9uKHRoaXMuX2NvbnRhaW5lciwgJ21vdXNlZG93bicsIHRoaXMuX29uTW91c2VEb3duLCB0aGlzKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub2ZmKHRoaXMuX2NvbnRhaW5lciwgJ21vdXNlZG93bicsIHRoaXMuX29uTW91c2VEb3duKTtcblx0XHR0aGlzLl9tb3ZlZCA9IGZhbHNlO1xuXHR9LFxuXG5cdG1vdmVkOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vdmVkO1xuXHR9LFxuXG5cdF9vbk1vdXNlRG93bjogZnVuY3Rpb24gKGUpIHtcblx0XHR0aGlzLl9tb3ZlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKCFlLnNoaWZ0S2V5IHx8ICgoZS53aGljaCAhPT0gMSkgJiYgKGUuYnV0dG9uICE9PSAxKSkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHRMLkRvbVV0aWwuZGlzYWJsZVRleHRTZWxlY3Rpb24oKTtcblx0XHRMLkRvbVV0aWwuZGlzYWJsZUltYWdlRHJhZygpO1xuXG5cdFx0dGhpcy5fc3RhcnRMYXllclBvaW50ID0gdGhpcy5fbWFwLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZSk7XG5cblx0XHRMLkRvbUV2ZW50XG5cdFx0ICAgIC5vbihkb2N1bWVudCwgJ21vdXNlbW92ZScsIHRoaXMuX29uTW91c2VNb3ZlLCB0aGlzKVxuXHRcdCAgICAub24oZG9jdW1lbnQsICdtb3VzZXVwJywgdGhpcy5fb25Nb3VzZVVwLCB0aGlzKVxuXHRcdCAgICAub24oZG9jdW1lbnQsICdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0aGlzKTtcblx0fSxcblxuXHRfb25Nb3VzZU1vdmU6IGZ1bmN0aW9uIChlKSB7XG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCkge1xuXHRcdFx0dGhpcy5fYm94ID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgJ2xlYWZsZXQtem9vbS1ib3gnLCB0aGlzLl9wYW5lKTtcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9ib3gsIHRoaXMuX3N0YXJ0TGF5ZXJQb2ludCk7XG5cblx0XHRcdC8vVE9ETyByZWZhY3RvcjogbW92ZSBjdXJzb3IgdG8gc3R5bGVzXG5cdFx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuY3Vyc29yID0gJ2Nyb3NzaGFpcic7XG5cdFx0XHR0aGlzLl9tYXAuZmlyZSgnYm94em9vbXN0YXJ0Jyk7XG5cdFx0fVxuXG5cdFx0dmFyIHN0YXJ0UG9pbnQgPSB0aGlzLl9zdGFydExheWVyUG9pbnQsXG5cdFx0ICAgIGJveCA9IHRoaXMuX2JveCxcblxuXHRcdCAgICBsYXllclBvaW50ID0gdGhpcy5fbWFwLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZSksXG5cdFx0ICAgIG9mZnNldCA9IGxheWVyUG9pbnQuc3VidHJhY3Qoc3RhcnRQb2ludCksXG5cblx0XHQgICAgbmV3UG9zID0gbmV3IEwuUG9pbnQoXG5cdFx0ICAgICAgICBNYXRoLm1pbihsYXllclBvaW50LngsIHN0YXJ0UG9pbnQueCksXG5cdFx0ICAgICAgICBNYXRoLm1pbihsYXllclBvaW50LnksIHN0YXJ0UG9pbnQueSkpO1xuXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKGJveCwgbmV3UG9zKTtcblxuXHRcdHRoaXMuX21vdmVkID0gdHJ1ZTtcblxuXHRcdC8vIFRPRE8gcmVmYWN0b3I6IHJlbW92ZSBoYXJkY29kZWQgNCBwaXhlbHNcblx0XHRib3guc3R5bGUud2lkdGggID0gKE1hdGgubWF4KDAsIE1hdGguYWJzKG9mZnNldC54KSAtIDQpKSArICdweCc7XG5cdFx0Ym94LnN0eWxlLmhlaWdodCA9IChNYXRoLm1heCgwLCBNYXRoLmFicyhvZmZzZXQueSkgLSA0KSkgKyAncHgnO1xuXHR9LFxuXG5cdF9maW5pc2g6IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAodGhpcy5fbW92ZWQpIHtcblx0XHRcdHRoaXMuX3BhbmUucmVtb3ZlQ2hpbGQodGhpcy5fYm94KTtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5jdXJzb3IgPSAnJztcblx0XHR9XG5cblx0XHRMLkRvbVV0aWwuZW5hYmxlVGV4dFNlbGVjdGlvbigpO1xuXHRcdEwuRG9tVXRpbC5lbmFibGVJbWFnZURyYWcoKTtcblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9mZihkb2N1bWVudCwgJ21vdXNlbW92ZScsIHRoaXMuX29uTW91c2VNb3ZlKVxuXHRcdCAgICAub2ZmKGRvY3VtZW50LCAnbW91c2V1cCcsIHRoaXMuX29uTW91c2VVcClcblx0XHQgICAgLm9mZihkb2N1bWVudCwgJ2tleWRvd24nLCB0aGlzLl9vbktleURvd24pO1xuXHR9LFxuXG5cdF9vbk1vdXNlVXA6IGZ1bmN0aW9uIChlKSB7XG5cblx0XHR0aGlzLl9maW5pc2goKTtcblxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXG5cdFx0ICAgIGxheWVyUG9pbnQgPSBtYXAubW91c2VFdmVudFRvTGF5ZXJQb2ludChlKTtcblxuXHRcdGlmICh0aGlzLl9zdGFydExheWVyUG9pbnQuZXF1YWxzKGxheWVyUG9pbnQpKSB7IHJldHVybjsgfVxuXG5cdFx0dmFyIGJvdW5kcyA9IG5ldyBMLkxhdExuZ0JvdW5kcyhcblx0XHQgICAgICAgIG1hcC5sYXllclBvaW50VG9MYXRMbmcodGhpcy5fc3RhcnRMYXllclBvaW50KSxcblx0XHQgICAgICAgIG1hcC5sYXllclBvaW50VG9MYXRMbmcobGF5ZXJQb2ludCkpO1xuXG5cdFx0bWFwLmZpdEJvdW5kcyhib3VuZHMpO1xuXG5cdFx0bWFwLmZpcmUoJ2JveHpvb21lbmQnLCB7XG5cdFx0XHRib3hab29tQm91bmRzOiBib3VuZHNcblx0XHR9KTtcblx0fSxcblxuXHRfb25LZXlEb3duOiBmdW5jdGlvbiAoZSkge1xuXHRcdGlmIChlLmtleUNvZGUgPT09IDI3KSB7XG5cdFx0XHR0aGlzLl9maW5pc2goKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5MLk1hcC5hZGRJbml0SG9vaygnYWRkSGFuZGxlcicsICdib3hab29tJywgTC5NYXAuQm94Wm9vbSk7XG5cblxuLypcbiAqIEwuTWFwLktleWJvYXJkIGlzIGhhbmRsaW5nIGtleWJvYXJkIGludGVyYWN0aW9uIHdpdGggdGhlIG1hcCwgZW5hYmxlZCBieSBkZWZhdWx0LlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdGtleWJvYXJkOiB0cnVlLFxuXHRrZXlib2FyZFBhbk9mZnNldDogODAsXG5cdGtleWJvYXJkWm9vbU9mZnNldDogMVxufSk7XG5cbkwuTWFwLktleWJvYXJkID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0a2V5Q29kZXM6IHtcblx0XHRsZWZ0OiAgICBbMzddLFxuXHRcdHJpZ2h0OiAgIFszOV0sXG5cdFx0ZG93bjogICAgWzQwXSxcblx0XHR1cDogICAgICBbMzhdLFxuXHRcdHpvb21JbjogIFsxODcsIDEwNywgNjEsIDE3MV0sXG5cdFx0em9vbU91dDogWzE4OSwgMTA5LCAxNzNdXG5cdH0sXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG1hcCkge1xuXHRcdHRoaXMuX21hcCA9IG1hcDtcblxuXHRcdHRoaXMuX3NldFBhbk9mZnNldChtYXAub3B0aW9ucy5rZXlib2FyZFBhbk9mZnNldCk7XG5cdFx0dGhpcy5fc2V0Wm9vbU9mZnNldChtYXAub3B0aW9ucy5rZXlib2FyZFpvb21PZmZzZXQpO1xuXHR9LFxuXG5cdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGNvbnRhaW5lciA9IHRoaXMuX21hcC5fY29udGFpbmVyO1xuXG5cdFx0Ly8gbWFrZSB0aGUgY29udGFpbmVyIGZvY3VzYWJsZSBieSB0YWJiaW5nXG5cdFx0aWYgKGNvbnRhaW5lci50YWJJbmRleCA9PT0gLTEpIHtcblx0XHRcdGNvbnRhaW5lci50YWJJbmRleCA9ICcwJztcblx0XHR9XG5cblx0XHRMLkRvbUV2ZW50XG5cdFx0ICAgIC5vbihjb250YWluZXIsICdmb2N1cycsIHRoaXMuX29uRm9jdXMsIHRoaXMpXG5cdFx0ICAgIC5vbihjb250YWluZXIsICdibHVyJywgdGhpcy5fb25CbHVyLCB0aGlzKVxuXHRcdCAgICAub24oY29udGFpbmVyLCAnbW91c2Vkb3duJywgdGhpcy5fb25Nb3VzZURvd24sIHRoaXMpO1xuXG5cdFx0dGhpcy5fbWFwXG5cdFx0ICAgIC5vbignZm9jdXMnLCB0aGlzLl9hZGRIb29rcywgdGhpcylcblx0XHQgICAgLm9uKCdibHVyJywgdGhpcy5fcmVtb3ZlSG9va3MsIHRoaXMpO1xuXHR9LFxuXG5cdHJlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5fcmVtb3ZlSG9va3MoKTtcblxuXHRcdHZhciBjb250YWluZXIgPSB0aGlzLl9tYXAuX2NvbnRhaW5lcjtcblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9mZihjb250YWluZXIsICdmb2N1cycsIHRoaXMuX29uRm9jdXMsIHRoaXMpXG5cdFx0ICAgIC5vZmYoY29udGFpbmVyLCAnYmx1cicsIHRoaXMuX29uQmx1ciwgdGhpcylcblx0XHQgICAgLm9mZihjb250YWluZXIsICdtb3VzZWRvd24nLCB0aGlzLl9vbk1vdXNlRG93biwgdGhpcyk7XG5cblx0XHR0aGlzLl9tYXBcblx0XHQgICAgLm9mZignZm9jdXMnLCB0aGlzLl9hZGRIb29rcywgdGhpcylcblx0XHQgICAgLm9mZignYmx1cicsIHRoaXMuX3JlbW92ZUhvb2tzLCB0aGlzKTtcblx0fSxcblxuXHRfb25Nb3VzZURvd246IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAodGhpcy5fZm9jdXNlZCkgeyByZXR1cm47IH1cblxuXHRcdHZhciBib2R5ID0gZG9jdW1lbnQuYm9keSxcblx0XHQgICAgZG9jRWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsXG5cdFx0ICAgIHRvcCA9IGJvZHkuc2Nyb2xsVG9wIHx8IGRvY0VsLnNjcm9sbFRvcCxcblx0XHQgICAgbGVmdCA9IGJvZHkuc2Nyb2xsTGVmdCB8fCBkb2NFbC5zY3JvbGxMZWZ0O1xuXG5cdFx0dGhpcy5fbWFwLl9jb250YWluZXIuZm9jdXMoKTtcblxuXHRcdHdpbmRvdy5zY3JvbGxUbyhsZWZ0LCB0b3ApO1xuXHR9LFxuXG5cdF9vbkZvY3VzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5fZm9jdXNlZCA9IHRydWU7XG5cdFx0dGhpcy5fbWFwLmZpcmUoJ2ZvY3VzJyk7XG5cdH0sXG5cblx0X29uQmx1cjogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX2ZvY3VzZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9tYXAuZmlyZSgnYmx1cicpO1xuXHR9LFxuXG5cdF9zZXRQYW5PZmZzZXQ6IGZ1bmN0aW9uIChwYW4pIHtcblx0XHR2YXIga2V5cyA9IHRoaXMuX3BhbktleXMgPSB7fSxcblx0XHQgICAgY29kZXMgPSB0aGlzLmtleUNvZGVzLFxuXHRcdCAgICBpLCBsZW47XG5cblx0XHRmb3IgKGkgPSAwLCBsZW4gPSBjb2Rlcy5sZWZ0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRrZXlzW2NvZGVzLmxlZnRbaV1dID0gWy0xICogcGFuLCAwXTtcblx0XHR9XG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29kZXMucmlnaHQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGtleXNbY29kZXMucmlnaHRbaV1dID0gW3BhbiwgMF07XG5cdFx0fVxuXHRcdGZvciAoaSA9IDAsIGxlbiA9IGNvZGVzLmRvd24ubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGtleXNbY29kZXMuZG93bltpXV0gPSBbMCwgcGFuXTtcblx0XHR9XG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29kZXMudXAubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGtleXNbY29kZXMudXBbaV1dID0gWzAsIC0xICogcGFuXTtcblx0XHR9XG5cdH0sXG5cblx0X3NldFpvb21PZmZzZXQ6IGZ1bmN0aW9uICh6b29tKSB7XG5cdFx0dmFyIGtleXMgPSB0aGlzLl96b29tS2V5cyA9IHt9LFxuXHRcdCAgICBjb2RlcyA9IHRoaXMua2V5Q29kZXMsXG5cdFx0ICAgIGksIGxlbjtcblxuXHRcdGZvciAoaSA9IDAsIGxlbiA9IGNvZGVzLnpvb21Jbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0a2V5c1tjb2Rlcy56b29tSW5baV1dID0gem9vbTtcblx0XHR9XG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29kZXMuem9vbU91dC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0a2V5c1tjb2Rlcy56b29tT3V0W2ldXSA9IC16b29tO1xuXHRcdH1cblx0fSxcblxuXHRfYWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9uKGRvY3VtZW50LCAna2V5ZG93bicsIHRoaXMuX29uS2V5RG93biwgdGhpcyk7XG5cdH0sXG5cblx0X3JlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0TC5Eb21FdmVudC5vZmYoZG9jdW1lbnQsICdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0aGlzKTtcblx0fSxcblxuXHRfb25LZXlEb3duOiBmdW5jdGlvbiAoZSkge1xuXHRcdHZhciBrZXkgPSBlLmtleUNvZGUsXG5cdFx0ICAgIG1hcCA9IHRoaXMuX21hcDtcblxuXHRcdGlmIChrZXkgaW4gdGhpcy5fcGFuS2V5cykge1xuXG5cdFx0XHRpZiAobWFwLl9wYW5BbmltICYmIG1hcC5fcGFuQW5pbS5faW5Qcm9ncmVzcykgeyByZXR1cm47IH1cblxuXHRcdFx0bWFwLnBhbkJ5KHRoaXMuX3BhbktleXNba2V5XSk7XG5cblx0XHRcdGlmIChtYXAub3B0aW9ucy5tYXhCb3VuZHMpIHtcblx0XHRcdFx0bWFwLnBhbkluc2lkZUJvdW5kcyhtYXAub3B0aW9ucy5tYXhCb3VuZHMpO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmIChrZXkgaW4gdGhpcy5fem9vbUtleXMpIHtcblx0XHRcdG1hcC5zZXRab29tKG1hcC5nZXRab29tKCkgKyB0aGlzLl96b29tS2V5c1trZXldKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0TC5Eb21FdmVudC5zdG9wKGUpO1xuXHR9XG59KTtcblxuTC5NYXAuYWRkSW5pdEhvb2soJ2FkZEhhbmRsZXInLCAna2V5Ym9hcmQnLCBMLk1hcC5LZXlib2FyZCk7XG5cblxuLypcbiAqIEwuSGFuZGxlci5NYXJrZXJEcmFnIGlzIHVzZWQgaW50ZXJuYWxseSBieSBMLk1hcmtlciB0byBtYWtlIHRoZSBtYXJrZXJzIGRyYWdnYWJsZS5cbiAqL1xuXG5MLkhhbmRsZXIuTWFya2VyRHJhZyA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobWFya2VyKSB7XG5cdFx0dGhpcy5fbWFya2VyID0gbWFya2VyO1xuXHR9LFxuXG5cdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGljb24gPSB0aGlzLl9tYXJrZXIuX2ljb247XG5cdFx0aWYgKCF0aGlzLl9kcmFnZ2FibGUpIHtcblx0XHRcdHRoaXMuX2RyYWdnYWJsZSA9IG5ldyBMLkRyYWdnYWJsZShpY29uLCBpY29uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kcmFnZ2FibGVcblx0XHRcdC5vbignZHJhZ3N0YXJ0JywgdGhpcy5fb25EcmFnU3RhcnQsIHRoaXMpXG5cdFx0XHQub24oJ2RyYWcnLCB0aGlzLl9vbkRyYWcsIHRoaXMpXG5cdFx0XHQub24oJ2RyYWdlbmQnLCB0aGlzLl9vbkRyYWdFbmQsIHRoaXMpO1xuXHRcdHRoaXMuX2RyYWdnYWJsZS5lbmFibGUoKTtcblx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fbWFya2VyLl9pY29uLCAnbGVhZmxldC1tYXJrZXItZHJhZ2dhYmxlJyk7XG5cdH0sXG5cblx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLl9kcmFnZ2FibGVcblx0XHRcdC5vZmYoJ2RyYWdzdGFydCcsIHRoaXMuX29uRHJhZ1N0YXJ0LCB0aGlzKVxuXHRcdFx0Lm9mZignZHJhZycsIHRoaXMuX29uRHJhZywgdGhpcylcblx0XHRcdC5vZmYoJ2RyYWdlbmQnLCB0aGlzLl9vbkRyYWdFbmQsIHRoaXMpO1xuXG5cdFx0dGhpcy5fZHJhZ2dhYmxlLmRpc2FibGUoKTtcblx0XHRMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fbWFya2VyLl9pY29uLCAnbGVhZmxldC1tYXJrZXItZHJhZ2dhYmxlJyk7XG5cdH0sXG5cblx0bW92ZWQ6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZHJhZ2dhYmxlICYmIHRoaXMuX2RyYWdnYWJsZS5fbW92ZWQ7XG5cdH0sXG5cblx0X29uRHJhZ1N0YXJ0OiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5fbWFya2VyXG5cdFx0ICAgIC5jbG9zZVBvcHVwKClcblx0XHQgICAgLmZpcmUoJ21vdmVzdGFydCcpXG5cdFx0ICAgIC5maXJlKCdkcmFnc3RhcnQnKTtcblx0fSxcblxuXHRfb25EcmFnOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIG1hcmtlciA9IHRoaXMuX21hcmtlcixcblx0XHQgICAgc2hhZG93ID0gbWFya2VyLl9zaGFkb3csXG5cdFx0ICAgIGljb25Qb3MgPSBMLkRvbVV0aWwuZ2V0UG9zaXRpb24obWFya2VyLl9pY29uKSxcblx0XHQgICAgbGF0bG5nID0gbWFya2VyLl9tYXAubGF5ZXJQb2ludFRvTGF0TG5nKGljb25Qb3MpO1xuXG5cdFx0Ly8gdXBkYXRlIHNoYWRvdyBwb3NpdGlvblxuXHRcdGlmIChzaGFkb3cpIHtcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbihzaGFkb3csIGljb25Qb3MpO1xuXHRcdH1cblxuXHRcdG1hcmtlci5fbGF0bG5nID0gbGF0bG5nO1xuXG5cdFx0bWFya2VyXG5cdFx0ICAgIC5maXJlKCdtb3ZlJywge2xhdGxuZzogbGF0bG5nfSlcblx0XHQgICAgLmZpcmUoJ2RyYWcnKTtcblx0fSxcblxuXHRfb25EcmFnRW5kOiBmdW5jdGlvbiAoZSkge1xuXHRcdHRoaXMuX21hcmtlclxuXHRcdCAgICAuZmlyZSgnbW92ZWVuZCcpXG5cdFx0ICAgIC5maXJlKCdkcmFnZW5kJywgZSk7XG5cdH1cbn0pO1xuXG5cbi8qXHJcbiAqIEwuQ29udHJvbCBpcyBhIGJhc2UgY2xhc3MgZm9yIGltcGxlbWVudGluZyBtYXAgY29udHJvbHMuIEhhbmRsZXMgcG9zaXRpb25pbmcuXHJcbiAqIEFsbCBvdGhlciBjb250cm9scyBleHRlbmQgZnJvbSB0aGlzIGNsYXNzLlxyXG4gKi9cclxuXHJcbkwuQ29udHJvbCA9IEwuQ2xhc3MuZXh0ZW5kKHtcclxuXHRvcHRpb25zOiB7XHJcblx0XHRwb3NpdGlvbjogJ3RvcHJpZ2h0J1xyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XHJcblx0fSxcclxuXHJcblx0Z2V0UG9zaXRpb246IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMucG9zaXRpb247XHJcblx0fSxcclxuXHJcblx0c2V0UG9zaXRpb246IGZ1bmN0aW9uIChwb3NpdGlvbikge1xyXG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcDtcclxuXHJcblx0XHRpZiAobWFwKSB7XHJcblx0XHRcdG1hcC5yZW1vdmVDb250cm9sKHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMub3B0aW9ucy5wb3NpdGlvbiA9IHBvc2l0aW9uO1xyXG5cclxuXHRcdGlmIChtYXApIHtcclxuXHRcdFx0bWFwLmFkZENvbnRyb2wodGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Z2V0Q29udGFpbmVyOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLl9tYXAgPSBtYXA7XHJcblxyXG5cdFx0dmFyIGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lciA9IHRoaXMub25BZGQobWFwKSxcclxuXHRcdCAgICBwb3MgPSB0aGlzLmdldFBvc2l0aW9uKCksXHJcblx0XHQgICAgY29ybmVyID0gbWFwLl9jb250cm9sQ29ybmVyc1twb3NdO1xyXG5cclxuXHRcdEwuRG9tVXRpbC5hZGRDbGFzcyhjb250YWluZXIsICdsZWFmbGV0LWNvbnRyb2wnKTtcclxuXHJcblx0XHRpZiAocG9zLmluZGV4T2YoJ2JvdHRvbScpICE9PSAtMSkge1xyXG5cdFx0XHRjb3JuZXIuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgY29ybmVyLmZpcnN0Q2hpbGQpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0Y29ybmVyLmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlRnJvbTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dmFyIHBvcyA9IHRoaXMuZ2V0UG9zaXRpb24oKSxcclxuXHRcdCAgICBjb3JuZXIgPSBtYXAuX2NvbnRyb2xDb3JuZXJzW3Bvc107XHJcblxyXG5cdFx0Y29ybmVyLnJlbW92ZUNoaWxkKHRoaXMuX2NvbnRhaW5lcik7XHJcblx0XHR0aGlzLl9tYXAgPSBudWxsO1xyXG5cclxuXHRcdGlmICh0aGlzLm9uUmVtb3ZlKSB7XHJcblx0XHRcdHRoaXMub25SZW1vdmUobWFwKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRfcmVmb2N1c09uTWFwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX21hcC5nZXRDb250YWluZXIoKS5mb2N1cygpO1xyXG5cdFx0fVxyXG5cdH1cclxufSk7XHJcblxyXG5MLmNvbnRyb2wgPSBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5Db250cm9sKG9wdGlvbnMpO1xyXG59O1xyXG5cclxuXHJcbi8vIGFkZHMgY29udHJvbC1yZWxhdGVkIG1ldGhvZHMgdG8gTC5NYXBcclxuXHJcbkwuTWFwLmluY2x1ZGUoe1xyXG5cdGFkZENvbnRyb2w6IGZ1bmN0aW9uIChjb250cm9sKSB7XHJcblx0XHRjb250cm9sLmFkZFRvKHRoaXMpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlQ29udHJvbDogZnVuY3Rpb24gKGNvbnRyb2wpIHtcclxuXHRcdGNvbnRyb2wucmVtb3ZlRnJvbSh0aGlzKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF9pbml0Q29udHJvbFBvczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGNvcm5lcnMgPSB0aGlzLl9jb250cm9sQ29ybmVycyA9IHt9LFxyXG5cdFx0ICAgIGwgPSAnbGVhZmxldC0nLFxyXG5cdFx0ICAgIGNvbnRhaW5lciA9IHRoaXMuX2NvbnRyb2xDb250YWluZXIgPVxyXG5cdFx0ICAgICAgICAgICAgTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgbCArICdjb250cm9sLWNvbnRhaW5lcicsIHRoaXMuX2NvbnRhaW5lcik7XHJcblxyXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQ29ybmVyKHZTaWRlLCBoU2lkZSkge1xyXG5cdFx0XHR2YXIgY2xhc3NOYW1lID0gbCArIHZTaWRlICsgJyAnICsgbCArIGhTaWRlO1xyXG5cclxuXHRcdFx0Y29ybmVyc1t2U2lkZSArIGhTaWRlXSA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIGNsYXNzTmFtZSwgY29udGFpbmVyKTtcclxuXHRcdH1cclxuXHJcblx0XHRjcmVhdGVDb3JuZXIoJ3RvcCcsICdsZWZ0Jyk7XHJcblx0XHRjcmVhdGVDb3JuZXIoJ3RvcCcsICdyaWdodCcpO1xyXG5cdFx0Y3JlYXRlQ29ybmVyKCdib3R0b20nLCAnbGVmdCcpO1xyXG5cdFx0Y3JlYXRlQ29ybmVyKCdib3R0b20nLCAncmlnaHQnKTtcclxuXHR9LFxyXG5cclxuXHRfY2xlYXJDb250cm9sUG9zOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9jb250YWluZXIucmVtb3ZlQ2hpbGQodGhpcy5fY29udHJvbENvbnRhaW5lcik7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIEwuQ29udHJvbC5ab29tIGlzIHVzZWQgZm9yIHRoZSBkZWZhdWx0IHpvb20gYnV0dG9ucyBvbiB0aGUgbWFwLlxyXG4gKi9cclxuXHJcbkwuQ29udHJvbC5ab29tID0gTC5Db250cm9sLmV4dGVuZCh7XHJcblx0b3B0aW9uczoge1xyXG5cdFx0cG9zaXRpb246ICd0b3BsZWZ0JyxcclxuXHRcdHpvb21JblRleHQ6ICcrJyxcclxuXHRcdHpvb21JblRpdGxlOiAnWm9vbSBpbicsXHJcblx0XHR6b29tT3V0VGV4dDogJy0nLFxyXG5cdFx0em9vbU91dFRpdGxlOiAnWm9vbSBvdXQnXHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHZhciB6b29tTmFtZSA9ICdsZWFmbGV0LWNvbnRyb2wtem9vbScsXHJcblx0XHQgICAgY29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2Jywgem9vbU5hbWUgKyAnIGxlYWZsZXQtYmFyJyk7XHJcblxyXG5cdFx0dGhpcy5fbWFwID0gbWFwO1xyXG5cclxuXHRcdHRoaXMuX3pvb21JbkJ1dHRvbiAgPSB0aGlzLl9jcmVhdGVCdXR0b24oXHJcblx0XHQgICAgICAgIHRoaXMub3B0aW9ucy56b29tSW5UZXh0LCB0aGlzLm9wdGlvbnMuem9vbUluVGl0bGUsXHJcblx0XHQgICAgICAgIHpvb21OYW1lICsgJy1pbicsICBjb250YWluZXIsIHRoaXMuX3pvb21JbiwgIHRoaXMpO1xyXG5cdFx0dGhpcy5fem9vbU91dEJ1dHRvbiA9IHRoaXMuX2NyZWF0ZUJ1dHRvbihcclxuXHRcdCAgICAgICAgdGhpcy5vcHRpb25zLnpvb21PdXRUZXh0LCB0aGlzLm9wdGlvbnMuem9vbU91dFRpdGxlLFxyXG5cdFx0ICAgICAgICB6b29tTmFtZSArICctb3V0JywgY29udGFpbmVyLCB0aGlzLl96b29tT3V0LCB0aGlzKTtcclxuXHJcblx0XHR0aGlzLl91cGRhdGVEaXNhYmxlZCgpO1xyXG5cdFx0bWFwLm9uKCd6b29tZW5kIHpvb21sZXZlbHNjaGFuZ2UnLCB0aGlzLl91cGRhdGVEaXNhYmxlZCwgdGhpcyk7XHJcblxyXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0bWFwLm9mZignem9vbWVuZCB6b29tbGV2ZWxzY2hhbmdlJywgdGhpcy5fdXBkYXRlRGlzYWJsZWQsIHRoaXMpO1xyXG5cdH0sXHJcblxyXG5cdF96b29tSW46IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR0aGlzLl9tYXAuem9vbUluKGUuc2hpZnRLZXkgPyAzIDogMSk7XHJcblx0fSxcclxuXHJcblx0X3pvb21PdXQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR0aGlzLl9tYXAuem9vbU91dChlLnNoaWZ0S2V5ID8gMyA6IDEpO1xyXG5cdH0sXHJcblxyXG5cdF9jcmVhdGVCdXR0b246IGZ1bmN0aW9uIChodG1sLCB0aXRsZSwgY2xhc3NOYW1lLCBjb250YWluZXIsIGZuLCBjb250ZXh0KSB7XHJcblx0XHR2YXIgbGluayA9IEwuRG9tVXRpbC5jcmVhdGUoJ2EnLCBjbGFzc05hbWUsIGNvbnRhaW5lcik7XHJcblx0XHRsaW5rLmlubmVySFRNTCA9IGh0bWw7XHJcblx0XHRsaW5rLmhyZWYgPSAnIyc7XHJcblx0XHRsaW5rLnRpdGxlID0gdGl0bGU7XHJcblxyXG5cdFx0dmFyIHN0b3AgPSBMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbjtcclxuXHJcblx0XHRMLkRvbUV2ZW50XHJcblx0XHQgICAgLm9uKGxpbmssICdjbGljaycsIHN0b3ApXHJcblx0XHQgICAgLm9uKGxpbmssICdtb3VzZWRvd24nLCBzdG9wKVxyXG5cdFx0ICAgIC5vbihsaW5rLCAnZGJsY2xpY2snLCBzdG9wKVxyXG5cdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KVxyXG5cdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCBmbiwgY29udGV4dClcclxuXHRcdCAgICAub24obGluaywgJ2NsaWNrJywgdGhpcy5fcmVmb2N1c09uTWFwLCBjb250ZXh0KTtcclxuXHJcblx0XHRyZXR1cm4gbGluaztcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlRGlzYWJsZWQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHRcdGNsYXNzTmFtZSA9ICdsZWFmbGV0LWRpc2FibGVkJztcclxuXHJcblx0XHRMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fem9vbUluQnV0dG9uLCBjbGFzc05hbWUpO1xyXG5cdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX3pvb21PdXRCdXR0b24sIGNsYXNzTmFtZSk7XHJcblxyXG5cdFx0aWYgKG1hcC5fem9vbSA9PT0gbWFwLmdldE1pblpvb20oKSkge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fem9vbU91dEJ1dHRvbiwgY2xhc3NOYW1lKTtcclxuXHRcdH1cclxuXHRcdGlmIChtYXAuX3pvb20gPT09IG1hcC5nZXRNYXhab29tKCkpIHtcclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX3pvb21JbkJ1dHRvbiwgY2xhc3NOYW1lKTtcclxuXHRcdH1cclxuXHR9XHJcbn0pO1xyXG5cclxuTC5NYXAubWVyZ2VPcHRpb25zKHtcclxuXHR6b29tQ29udHJvbDogdHJ1ZVxyXG59KTtcclxuXHJcbkwuTWFwLmFkZEluaXRIb29rKGZ1bmN0aW9uICgpIHtcclxuXHRpZiAodGhpcy5vcHRpb25zLnpvb21Db250cm9sKSB7XHJcblx0XHR0aGlzLnpvb21Db250cm9sID0gbmV3IEwuQ29udHJvbC5ab29tKCk7XHJcblx0XHR0aGlzLmFkZENvbnRyb2wodGhpcy56b29tQ29udHJvbCk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuY29udHJvbC56b29tID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRyZXR1cm4gbmV3IEwuQ29udHJvbC5ab29tKG9wdGlvbnMpO1xyXG59O1xyXG5cclxuXG5cbi8qXHJcbiAqIEwuQ29udHJvbC5BdHRyaWJ1dGlvbiBpcyB1c2VkIGZvciBkaXNwbGF5aW5nIGF0dHJpYnV0aW9uIG9uIHRoZSBtYXAgKGFkZGVkIGJ5IGRlZmF1bHQpLlxyXG4gKi9cclxuXHJcbkwuQ29udHJvbC5BdHRyaWJ1dGlvbiA9IEwuQ29udHJvbC5leHRlbmQoe1xyXG5cdG9wdGlvbnM6IHtcclxuXHRcdHBvc2l0aW9uOiAnYm90dG9tcmlnaHQnLFxyXG5cdFx0cHJlZml4OiAnPGEgaHJlZj1cImh0dHA6Ly9sZWFmbGV0anMuY29tXCIgdGl0bGU9XCJBIEpTIGxpYnJhcnkgZm9yIGludGVyYWN0aXZlIG1hcHNcIj5MZWFmbGV0PC9hPidcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdHRoaXMuX2F0dHJpYnV0aW9ucyA9IHt9O1xyXG5cdH0sXHJcblxyXG5cdG9uQWRkOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLl9jb250YWluZXIgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1jb250cm9sLWF0dHJpYnV0aW9uJyk7XHJcblx0XHRMLkRvbUV2ZW50LmRpc2FibGVDbGlja1Byb3BhZ2F0aW9uKHRoaXMuX2NvbnRhaW5lcik7XHJcblxyXG5cdFx0Zm9yICh2YXIgaSBpbiBtYXAuX2xheWVycykge1xyXG5cdFx0XHRpZiAobWFwLl9sYXllcnNbaV0uZ2V0QXR0cmlidXRpb24pIHtcclxuXHRcdFx0XHR0aGlzLmFkZEF0dHJpYnV0aW9uKG1hcC5fbGF5ZXJzW2ldLmdldEF0dHJpYnV0aW9uKCkpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdG1hcFxyXG5cdFx0ICAgIC5vbignbGF5ZXJhZGQnLCB0aGlzLl9vbkxheWVyQWRkLCB0aGlzKVxyXG5cdFx0ICAgIC5vbignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyUmVtb3ZlLCB0aGlzKTtcclxuXHJcblx0XHR0aGlzLl91cGRhdGUoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXBcclxuXHRcdCAgICAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX29uTGF5ZXJBZGQpXHJcblx0XHQgICAgLm9mZignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyUmVtb3ZlKTtcclxuXHJcblx0fSxcclxuXHJcblx0c2V0UHJlZml4OiBmdW5jdGlvbiAocHJlZml4KSB7XHJcblx0XHR0aGlzLm9wdGlvbnMucHJlZml4ID0gcHJlZml4O1xyXG5cdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRhZGRBdHRyaWJ1dGlvbjogZnVuY3Rpb24gKHRleHQpIHtcclxuXHRcdGlmICghdGV4dCkgeyByZXR1cm47IH1cclxuXHJcblx0XHRpZiAoIXRoaXMuX2F0dHJpYnV0aW9uc1t0ZXh0XSkge1xyXG5cdFx0XHR0aGlzLl9hdHRyaWJ1dGlvbnNbdGV4dF0gPSAwO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fYXR0cmlidXRpb25zW3RleHRdKys7XHJcblxyXG5cdFx0dGhpcy5fdXBkYXRlKCk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlQXR0cmlidXRpb246IGZ1bmN0aW9uICh0ZXh0KSB7XHJcblx0XHRpZiAoIXRleHQpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2F0dHJpYnV0aW9uc1t0ZXh0XSkge1xyXG5cdFx0XHR0aGlzLl9hdHRyaWJ1dGlvbnNbdGV4dF0tLTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIGF0dHJpYnMgPSBbXTtcclxuXHJcblx0XHRmb3IgKHZhciBpIGluIHRoaXMuX2F0dHJpYnV0aW9ucykge1xyXG5cdFx0XHRpZiAodGhpcy5fYXR0cmlidXRpb25zW2ldKSB7XHJcblx0XHRcdFx0YXR0cmlicy5wdXNoKGkpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIHByZWZpeEFuZEF0dHJpYnMgPSBbXTtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnByZWZpeCkge1xyXG5cdFx0XHRwcmVmaXhBbmRBdHRyaWJzLnB1c2godGhpcy5vcHRpb25zLnByZWZpeCk7XHJcblx0XHR9XHJcblx0XHRpZiAoYXR0cmlicy5sZW5ndGgpIHtcclxuXHRcdFx0cHJlZml4QW5kQXR0cmlicy5wdXNoKGF0dHJpYnMuam9pbignLCAnKSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fY29udGFpbmVyLmlubmVySFRNTCA9IHByZWZpeEFuZEF0dHJpYnMuam9pbignIHwgJyk7XHJcblx0fSxcclxuXHJcblx0X29uTGF5ZXJBZGQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAoZS5sYXllci5nZXRBdHRyaWJ1dGlvbikge1xyXG5cdFx0XHR0aGlzLmFkZEF0dHJpYnV0aW9uKGUubGF5ZXIuZ2V0QXR0cmlidXRpb24oKSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X29uTGF5ZXJSZW1vdmU6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAoZS5sYXllci5nZXRBdHRyaWJ1dGlvbikge1xyXG5cdFx0XHR0aGlzLnJlbW92ZUF0dHJpYnV0aW9uKGUubGF5ZXIuZ2V0QXR0cmlidXRpb24oKSk7XHJcblx0XHR9XHJcblx0fVxyXG59KTtcclxuXHJcbkwuTWFwLm1lcmdlT3B0aW9ucyh7XHJcblx0YXR0cmlidXRpb25Db250cm9sOiB0cnVlXHJcbn0pO1xyXG5cclxuTC5NYXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xyXG5cdGlmICh0aGlzLm9wdGlvbnMuYXR0cmlidXRpb25Db250cm9sKSB7XHJcblx0XHR0aGlzLmF0dHJpYnV0aW9uQ29udHJvbCA9IChuZXcgTC5Db250cm9sLkF0dHJpYnV0aW9uKCkpLmFkZFRvKHRoaXMpO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLmNvbnRyb2wuYXR0cmlidXRpb24gPSBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5Db250cm9sLkF0dHJpYnV0aW9uKG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcbiAqIEwuQ29udHJvbC5TY2FsZSBpcyB1c2VkIGZvciBkaXNwbGF5aW5nIG1ldHJpYy9pbXBlcmlhbCBzY2FsZSBvbiB0aGUgbWFwLlxuICovXG5cbkwuQ29udHJvbC5TY2FsZSA9IEwuQ29udHJvbC5leHRlbmQoe1xuXHRvcHRpb25zOiB7XG5cdFx0cG9zaXRpb246ICdib3R0b21sZWZ0Jyxcblx0XHRtYXhXaWR0aDogMTAwLFxuXHRcdG1ldHJpYzogdHJ1ZSxcblx0XHRpbXBlcmlhbDogdHJ1ZSxcblx0XHR1cGRhdGVXaGVuSWRsZTogZmFsc2Vcblx0fSxcblxuXHRvbkFkZDogZnVuY3Rpb24gKG1hcCkge1xuXHRcdHRoaXMuX21hcCA9IG1hcDtcblxuXHRcdHZhciBjbGFzc05hbWUgPSAnbGVhZmxldC1jb250cm9sLXNjYWxlJyxcblx0XHQgICAgY29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lKSxcblx0XHQgICAgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcblxuXHRcdHRoaXMuX2FkZFNjYWxlcyhvcHRpb25zLCBjbGFzc05hbWUsIGNvbnRhaW5lcik7XG5cblx0XHRtYXAub24ob3B0aW9ucy51cGRhdGVXaGVuSWRsZSA/ICdtb3ZlZW5kJyA6ICdtb3ZlJywgdGhpcy5fdXBkYXRlLCB0aGlzKTtcblx0XHRtYXAud2hlblJlYWR5KHRoaXMuX3VwZGF0ZSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9LFxuXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XG5cdFx0bWFwLm9mZih0aGlzLm9wdGlvbnMudXBkYXRlV2hlbklkbGUgPyAnbW92ZWVuZCcgOiAnbW92ZScsIHRoaXMuX3VwZGF0ZSwgdGhpcyk7XG5cdH0sXG5cblx0X2FkZFNjYWxlczogZnVuY3Rpb24gKG9wdGlvbnMsIGNsYXNzTmFtZSwgY29udGFpbmVyKSB7XG5cdFx0aWYgKG9wdGlvbnMubWV0cmljKSB7XG5cdFx0XHR0aGlzLl9tU2NhbGUgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCBjbGFzc05hbWUgKyAnLWxpbmUnLCBjb250YWluZXIpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5pbXBlcmlhbCkge1xuXHRcdFx0dGhpcy5faVNjYWxlID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lICsgJy1saW5lJywgY29udGFpbmVyKTtcblx0XHR9XG5cdH0sXG5cblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBib3VuZHMgPSB0aGlzLl9tYXAuZ2V0Qm91bmRzKCksXG5cdFx0ICAgIGNlbnRlckxhdCA9IGJvdW5kcy5nZXRDZW50ZXIoKS5sYXQsXG5cdFx0ICAgIGhhbGZXb3JsZE1ldGVycyA9IDYzNzgxMzcgKiBNYXRoLlBJICogTWF0aC5jb3MoY2VudGVyTGF0ICogTWF0aC5QSSAvIDE4MCksXG5cdFx0ICAgIGRpc3QgPSBoYWxmV29ybGRNZXRlcnMgKiAoYm91bmRzLmdldE5vcnRoRWFzdCgpLmxuZyAtIGJvdW5kcy5nZXRTb3V0aFdlc3QoKS5sbmcpIC8gMTgwLFxuXG5cdFx0ICAgIHNpemUgPSB0aGlzLl9tYXAuZ2V0U2l6ZSgpLFxuXHRcdCAgICBvcHRpb25zID0gdGhpcy5vcHRpb25zLFxuXHRcdCAgICBtYXhNZXRlcnMgPSAwO1xuXG5cdFx0aWYgKHNpemUueCA+IDApIHtcblx0XHRcdG1heE1ldGVycyA9IGRpc3QgKiAob3B0aW9ucy5tYXhXaWR0aCAvIHNpemUueCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlU2NhbGVzKG9wdGlvbnMsIG1heE1ldGVycyk7XG5cdH0sXG5cblx0X3VwZGF0ZVNjYWxlczogZnVuY3Rpb24gKG9wdGlvbnMsIG1heE1ldGVycykge1xuXHRcdGlmIChvcHRpb25zLm1ldHJpYyAmJiBtYXhNZXRlcnMpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZU1ldHJpYyhtYXhNZXRlcnMpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmltcGVyaWFsICYmIG1heE1ldGVycykge1xuXHRcdFx0dGhpcy5fdXBkYXRlSW1wZXJpYWwobWF4TWV0ZXJzKTtcblx0XHR9XG5cdH0sXG5cblx0X3VwZGF0ZU1ldHJpYzogZnVuY3Rpb24gKG1heE1ldGVycykge1xuXHRcdHZhciBtZXRlcnMgPSB0aGlzLl9nZXRSb3VuZE51bShtYXhNZXRlcnMpO1xuXG5cdFx0dGhpcy5fbVNjYWxlLnN0eWxlLndpZHRoID0gdGhpcy5fZ2V0U2NhbGVXaWR0aChtZXRlcnMgLyBtYXhNZXRlcnMpICsgJ3B4Jztcblx0XHR0aGlzLl9tU2NhbGUuaW5uZXJIVE1MID0gbWV0ZXJzIDwgMTAwMCA/IG1ldGVycyArICcgbScgOiAobWV0ZXJzIC8gMTAwMCkgKyAnIGttJztcblx0fSxcblxuXHRfdXBkYXRlSW1wZXJpYWw6IGZ1bmN0aW9uIChtYXhNZXRlcnMpIHtcblx0XHR2YXIgbWF4RmVldCA9IG1heE1ldGVycyAqIDMuMjgwODM5OSxcblx0XHQgICAgc2NhbGUgPSB0aGlzLl9pU2NhbGUsXG5cdFx0ICAgIG1heE1pbGVzLCBtaWxlcywgZmVldDtcblxuXHRcdGlmIChtYXhGZWV0ID4gNTI4MCkge1xuXHRcdFx0bWF4TWlsZXMgPSBtYXhGZWV0IC8gNTI4MDtcblx0XHRcdG1pbGVzID0gdGhpcy5fZ2V0Um91bmROdW0obWF4TWlsZXMpO1xuXG5cdFx0XHRzY2FsZS5zdHlsZS53aWR0aCA9IHRoaXMuX2dldFNjYWxlV2lkdGgobWlsZXMgLyBtYXhNaWxlcykgKyAncHgnO1xuXHRcdFx0c2NhbGUuaW5uZXJIVE1MID0gbWlsZXMgKyAnIG1pJztcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmZWV0ID0gdGhpcy5fZ2V0Um91bmROdW0obWF4RmVldCk7XG5cblx0XHRcdHNjYWxlLnN0eWxlLndpZHRoID0gdGhpcy5fZ2V0U2NhbGVXaWR0aChmZWV0IC8gbWF4RmVldCkgKyAncHgnO1xuXHRcdFx0c2NhbGUuaW5uZXJIVE1MID0gZmVldCArICcgZnQnO1xuXHRcdH1cblx0fSxcblxuXHRfZ2V0U2NhbGVXaWR0aDogZnVuY3Rpb24gKHJhdGlvKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5vcHRpb25zLm1heFdpZHRoICogcmF0aW8pIC0gMTA7XG5cdH0sXG5cblx0X2dldFJvdW5kTnVtOiBmdW5jdGlvbiAobnVtKSB7XG5cdFx0dmFyIHBvdzEwID0gTWF0aC5wb3coMTAsIChNYXRoLmZsb29yKG51bSkgKyAnJykubGVuZ3RoIC0gMSksXG5cdFx0ICAgIGQgPSBudW0gLyBwb3cxMDtcblxuXHRcdGQgPSBkID49IDEwID8gMTAgOiBkID49IDUgPyA1IDogZCA+PSAzID8gMyA6IGQgPj0gMiA/IDIgOiAxO1xuXG5cdFx0cmV0dXJuIHBvdzEwICogZDtcblx0fVxufSk7XG5cbkwuY29udHJvbC5zY2FsZSA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdHJldHVybiBuZXcgTC5Db250cm9sLlNjYWxlKG9wdGlvbnMpO1xufTtcblxuXG4vKlxyXG4gKiBMLkNvbnRyb2wuTGF5ZXJzIGlzIGEgY29udHJvbCB0byBhbGxvdyB1c2VycyB0byBzd2l0Y2ggYmV0d2VlbiBkaWZmZXJlbnQgbGF5ZXJzIG9uIHRoZSBtYXAuXHJcbiAqL1xyXG5cclxuTC5Db250cm9sLkxheWVycyA9IEwuQ29udHJvbC5leHRlbmQoe1xyXG5cdG9wdGlvbnM6IHtcclxuXHRcdGNvbGxhcHNlZDogdHJ1ZSxcclxuXHRcdHBvc2l0aW9uOiAndG9wcmlnaHQnLFxyXG5cdFx0YXV0b1pJbmRleDogdHJ1ZVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChiYXNlTGF5ZXJzLCBvdmVybGF5cywgb3B0aW9ucykge1xyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdHRoaXMuX2xheWVycyA9IHt9O1xyXG5cdFx0dGhpcy5fbGFzdFpJbmRleCA9IDA7XHJcblx0XHR0aGlzLl9oYW5kbGluZ0NsaWNrID0gZmFsc2U7XHJcblxyXG5cdFx0Zm9yICh2YXIgaSBpbiBiYXNlTGF5ZXJzKSB7XHJcblx0XHRcdHRoaXMuX2FkZExheWVyKGJhc2VMYXllcnNbaV0sIGkpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGZvciAoaSBpbiBvdmVybGF5cykge1xyXG5cdFx0XHR0aGlzLl9hZGRMYXllcihvdmVybGF5c1tpXSwgaSwgdHJ1ZSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHRoaXMuX2luaXRMYXlvdXQoKTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cclxuXHRcdG1hcFxyXG5cdFx0ICAgIC5vbignbGF5ZXJhZGQnLCB0aGlzLl9vbkxheWVyQ2hhbmdlLCB0aGlzKVxyXG5cdFx0ICAgIC5vbignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyQ2hhbmdlLCB0aGlzKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXBcclxuXHRcdCAgICAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX29uTGF5ZXJDaGFuZ2UsIHRoaXMpXHJcblx0XHQgICAgLm9mZignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyQ2hhbmdlLCB0aGlzKTtcclxuXHR9LFxyXG5cclxuXHRhZGRCYXNlTGF5ZXI6IGZ1bmN0aW9uIChsYXllciwgbmFtZSkge1xyXG5cdFx0dGhpcy5fYWRkTGF5ZXIobGF5ZXIsIG5hbWUpO1xyXG5cdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRhZGRPdmVybGF5OiBmdW5jdGlvbiAobGF5ZXIsIG5hbWUpIHtcclxuXHRcdHRoaXMuX2FkZExheWVyKGxheWVyLCBuYW1lLCB0cnVlKTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblx0XHRkZWxldGUgdGhpcy5fbGF5ZXJzW2lkXTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0X2luaXRMYXlvdXQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjbGFzc05hbWUgPSAnbGVhZmxldC1jb250cm9sLWxheWVycycsXHJcblx0XHQgICAgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lKTtcclxuXHJcblx0XHQvL01ha2VzIHRoaXMgd29yayBvbiBJRTEwIFRvdWNoIGRldmljZXMgYnkgc3RvcHBpbmcgaXQgZnJvbSBmaXJpbmcgYSBtb3VzZW91dCBldmVudCB3aGVuIHRoZSB0b3VjaCBpcyByZWxlYXNlZFxyXG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsIHRydWUpO1xyXG5cclxuXHRcdGlmICghTC5Ccm93c2VyLnRvdWNoKSB7XHJcblx0XHRcdEwuRG9tRXZlbnRcclxuXHRcdFx0XHQuZGlzYWJsZUNsaWNrUHJvcGFnYXRpb24oY29udGFpbmVyKVxyXG5cdFx0XHRcdC5kaXNhYmxlU2Nyb2xsUHJvcGFnYXRpb24oY29udGFpbmVyKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdEwuRG9tRXZlbnQub24oY29udGFpbmVyLCAnY2xpY2snLCBMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbik7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGZvcm0gPSB0aGlzLl9mb3JtID0gTC5Eb21VdGlsLmNyZWF0ZSgnZm9ybScsIGNsYXNzTmFtZSArICctbGlzdCcpO1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY29sbGFwc2VkKSB7XHJcblx0XHRcdGlmICghTC5Ccm93c2VyLmFuZHJvaWQpIHtcclxuXHRcdFx0XHRMLkRvbUV2ZW50XHJcblx0XHRcdFx0ICAgIC5vbihjb250YWluZXIsICdtb3VzZW92ZXInLCB0aGlzLl9leHBhbmQsIHRoaXMpXHJcblx0XHRcdFx0ICAgIC5vbihjb250YWluZXIsICdtb3VzZW91dCcsIHRoaXMuX2NvbGxhcHNlLCB0aGlzKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR2YXIgbGluayA9IHRoaXMuX2xheWVyc0xpbmsgPSBMLkRvbVV0aWwuY3JlYXRlKCdhJywgY2xhc3NOYW1lICsgJy10b2dnbGUnLCBjb250YWluZXIpO1xyXG5cdFx0XHRsaW5rLmhyZWYgPSAnIyc7XHJcblx0XHRcdGxpbmsudGl0bGUgPSAnTGF5ZXJzJztcclxuXHJcblx0XHRcdGlmIChMLkJyb3dzZXIudG91Y2gpIHtcclxuXHRcdFx0XHRMLkRvbUV2ZW50XHJcblx0XHRcdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCBMLkRvbUV2ZW50LnN0b3ApXHJcblx0XHRcdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCB0aGlzLl9leHBhbmQsIHRoaXMpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdEwuRG9tRXZlbnQub24obGluaywgJ2ZvY3VzJywgdGhpcy5fZXhwYW5kLCB0aGlzKTtcclxuXHRcdFx0fVxyXG5cdFx0XHQvL1dvcmsgYXJvdW5kIGZvciBGaXJlZm94IGFuZHJvaWQgaXNzdWUgaHR0cHM6Ly9naXRodWIuY29tL0xlYWZsZXQvTGVhZmxldC9pc3N1ZXMvMjAzM1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9uKGZvcm0sICdjbGljaycsIGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0XHRzZXRUaW1lb3V0KEwuYmluZCh0aGlzLl9vbklucHV0Q2xpY2ssIHRoaXMpLCAwKTtcclxuXHRcdFx0fSwgdGhpcyk7XHJcblxyXG5cdFx0XHR0aGlzLl9tYXAub24oJ2NsaWNrJywgdGhpcy5fY29sbGFwc2UsIHRoaXMpO1xyXG5cdFx0XHQvLyBUT0RPIGtleWJvYXJkIGFjY2Vzc2liaWxpdHlcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX2V4cGFuZCgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2Jhc2VMYXllcnNMaXN0ID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lICsgJy1iYXNlJywgZm9ybSk7XHJcblx0XHR0aGlzLl9zZXBhcmF0b3IgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCBjbGFzc05hbWUgKyAnLXNlcGFyYXRvcicsIGZvcm0pO1xyXG5cdFx0dGhpcy5fb3ZlcmxheXNMaXN0ID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lICsgJy1vdmVybGF5cycsIGZvcm0pO1xyXG5cclxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChmb3JtKTtcclxuXHR9LFxyXG5cclxuXHRfYWRkTGF5ZXI6IGZ1bmN0aW9uIChsYXllciwgbmFtZSwgb3ZlcmxheSkge1xyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblxyXG5cdFx0dGhpcy5fbGF5ZXJzW2lkXSA9IHtcclxuXHRcdFx0bGF5ZXI6IGxheWVyLFxyXG5cdFx0XHRuYW1lOiBuYW1lLFxyXG5cdFx0XHRvdmVybGF5OiBvdmVybGF5XHJcblx0XHR9O1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuYXV0b1pJbmRleCAmJiBsYXllci5zZXRaSW5kZXgpIHtcclxuXHRcdFx0dGhpcy5fbGFzdFpJbmRleCsrO1xyXG5cdFx0XHRsYXllci5zZXRaSW5kZXgodGhpcy5fbGFzdFpJbmRleCk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2Jhc2VMYXllcnNMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cdFx0dGhpcy5fb3ZlcmxheXNMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cclxuXHRcdHZhciBiYXNlTGF5ZXJzUHJlc2VudCA9IGZhbHNlLFxyXG5cdFx0ICAgIG92ZXJsYXlzUHJlc2VudCA9IGZhbHNlLFxyXG5cdFx0ICAgIGksIG9iajtcclxuXHJcblx0XHRmb3IgKGkgaW4gdGhpcy5fbGF5ZXJzKSB7XHJcblx0XHRcdG9iaiA9IHRoaXMuX2xheWVyc1tpXTtcclxuXHRcdFx0dGhpcy5fYWRkSXRlbShvYmopO1xyXG5cdFx0XHRvdmVybGF5c1ByZXNlbnQgPSBvdmVybGF5c1ByZXNlbnQgfHwgb2JqLm92ZXJsYXk7XHJcblx0XHRcdGJhc2VMYXllcnNQcmVzZW50ID0gYmFzZUxheWVyc1ByZXNlbnQgfHwgIW9iai5vdmVybGF5O1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3NlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gb3ZlcmxheXNQcmVzZW50ICYmIGJhc2VMYXllcnNQcmVzZW50ID8gJycgOiAnbm9uZSc7XHJcblx0fSxcclxuXHJcblx0X29uTGF5ZXJDaGFuZ2U6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR2YXIgb2JqID0gdGhpcy5fbGF5ZXJzW0wuc3RhbXAoZS5sYXllcildO1xyXG5cclxuXHRcdGlmICghb2JqKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGlmICghdGhpcy5faGFuZGxpbmdDbGljaykge1xyXG5cdFx0XHR0aGlzLl91cGRhdGUoKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgdHlwZSA9IG9iai5vdmVybGF5ID9cclxuXHRcdFx0KGUudHlwZSA9PT0gJ2xheWVyYWRkJyA/ICdvdmVybGF5YWRkJyA6ICdvdmVybGF5cmVtb3ZlJykgOlxyXG5cdFx0XHQoZS50eXBlID09PSAnbGF5ZXJhZGQnID8gJ2Jhc2VsYXllcmNoYW5nZScgOiBudWxsKTtcclxuXHJcblx0XHRpZiAodHlwZSkge1xyXG5cdFx0XHR0aGlzLl9tYXAuZmlyZSh0eXBlLCBvYmopO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIElFNyBidWdzIG91dCBpZiB5b3UgY3JlYXRlIGEgcmFkaW8gZHluYW1pY2FsbHksIHNvIHlvdSBoYXZlIHRvIGRvIGl0IHRoaXMgaGFja3kgd2F5IChzZWUgaHR0cDovL2JpdC5seS9QcVlMQmUpXHJcblx0X2NyZWF0ZVJhZGlvRWxlbWVudDogZnVuY3Rpb24gKG5hbWUsIGNoZWNrZWQpIHtcclxuXHJcblx0XHR2YXIgcmFkaW9IdG1sID0gJzxpbnB1dCB0eXBlPVwicmFkaW9cIiBjbGFzcz1cImxlYWZsZXQtY29udHJvbC1sYXllcnMtc2VsZWN0b3JcIiBuYW1lPVwiJyArIG5hbWUgKyAnXCInO1xyXG5cdFx0aWYgKGNoZWNrZWQpIHtcclxuXHRcdFx0cmFkaW9IdG1sICs9ICcgY2hlY2tlZD1cImNoZWNrZWRcIic7XHJcblx0XHR9XHJcblx0XHRyYWRpb0h0bWwgKz0gJy8+JztcclxuXHJcblx0XHR2YXIgcmFkaW9GcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdFx0cmFkaW9GcmFnbWVudC5pbm5lckhUTUwgPSByYWRpb0h0bWw7XHJcblxyXG5cdFx0cmV0dXJuIHJhZGlvRnJhZ21lbnQuZmlyc3RDaGlsZDtcclxuXHR9LFxyXG5cclxuXHRfYWRkSXRlbTogZnVuY3Rpb24gKG9iaikge1xyXG5cdFx0dmFyIGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGFiZWwnKSxcclxuXHRcdCAgICBpbnB1dCxcclxuXHRcdCAgICBjaGVja2VkID0gdGhpcy5fbWFwLmhhc0xheWVyKG9iai5sYXllcik7XHJcblxyXG5cdFx0aWYgKG9iai5vdmVybGF5KSB7XHJcblx0XHRcdGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcclxuXHRcdFx0aW5wdXQudHlwZSA9ICdjaGVja2JveCc7XHJcblx0XHRcdGlucHV0LmNsYXNzTmFtZSA9ICdsZWFmbGV0LWNvbnRyb2wtbGF5ZXJzLXNlbGVjdG9yJztcclxuXHRcdFx0aW5wdXQuZGVmYXVsdENoZWNrZWQgPSBjaGVja2VkO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aW5wdXQgPSB0aGlzLl9jcmVhdGVSYWRpb0VsZW1lbnQoJ2xlYWZsZXQtYmFzZS1sYXllcnMnLCBjaGVja2VkKTtcclxuXHRcdH1cclxuXHJcblx0XHRpbnB1dC5sYXllcklkID0gTC5zdGFtcChvYmoubGF5ZXIpO1xyXG5cclxuXHRcdEwuRG9tRXZlbnQub24oaW5wdXQsICdjbGljaycsIHRoaXMuX29uSW5wdXRDbGljaywgdGhpcyk7XHJcblxyXG5cdFx0dmFyIG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblx0XHRuYW1lLmlubmVySFRNTCA9ICcgJyArIG9iai5uYW1lO1xyXG5cclxuXHRcdGxhYmVsLmFwcGVuZENoaWxkKGlucHV0KTtcclxuXHRcdGxhYmVsLmFwcGVuZENoaWxkKG5hbWUpO1xyXG5cclxuXHRcdHZhciBjb250YWluZXIgPSBvYmoub3ZlcmxheSA/IHRoaXMuX292ZXJsYXlzTGlzdCA6IHRoaXMuX2Jhc2VMYXllcnNMaXN0O1xyXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGxhYmVsKTtcclxuXHJcblx0XHRyZXR1cm4gbGFiZWw7XHJcblx0fSxcclxuXHJcblx0X29uSW5wdXRDbGljazogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGksIGlucHV0LCBvYmosXHJcblx0XHQgICAgaW5wdXRzID0gdGhpcy5fZm9ybS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaW5wdXQnKSxcclxuXHRcdCAgICBpbnB1dHNMZW4gPSBpbnB1dHMubGVuZ3RoO1xyXG5cclxuXHRcdHRoaXMuX2hhbmRsaW5nQ2xpY2sgPSB0cnVlO1xyXG5cclxuXHRcdGZvciAoaSA9IDA7IGkgPCBpbnB1dHNMZW47IGkrKykge1xyXG5cdFx0XHRpbnB1dCA9IGlucHV0c1tpXTtcclxuXHRcdFx0b2JqID0gdGhpcy5fbGF5ZXJzW2lucHV0LmxheWVySWRdO1xyXG5cclxuXHRcdFx0aWYgKGlucHV0LmNoZWNrZWQgJiYgIXRoaXMuX21hcC5oYXNMYXllcihvYmoubGF5ZXIpKSB7XHJcblx0XHRcdFx0dGhpcy5fbWFwLmFkZExheWVyKG9iai5sYXllcik7XHJcblxyXG5cdFx0XHR9IGVsc2UgaWYgKCFpbnB1dC5jaGVja2VkICYmIHRoaXMuX21hcC5oYXNMYXllcihvYmoubGF5ZXIpKSB7XHJcblx0XHRcdFx0dGhpcy5fbWFwLnJlbW92ZUxheWVyKG9iai5sYXllcik7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9oYW5kbGluZ0NsaWNrID0gZmFsc2U7XHJcblxyXG5cdFx0dGhpcy5fcmVmb2N1c09uTWFwKCk7XHJcblx0fSxcclxuXHJcblx0X2V4cGFuZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2NvbnRhaW5lciwgJ2xlYWZsZXQtY29udHJvbC1sYXllcnMtZXhwYW5kZWQnKTtcclxuXHR9LFxyXG5cclxuXHRfY29sbGFwc2U6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc05hbWUgPSB0aGlzLl9jb250YWluZXIuY2xhc3NOYW1lLnJlcGxhY2UoJyBsZWFmbGV0LWNvbnRyb2wtbGF5ZXJzLWV4cGFuZGVkJywgJycpO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLmNvbnRyb2wubGF5ZXJzID0gZnVuY3Rpb24gKGJhc2VMYXllcnMsIG92ZXJsYXlzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkNvbnRyb2wuTGF5ZXJzKGJhc2VMYXllcnMsIG92ZXJsYXlzLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXG4gKiBMLlBvc0FuaW1hdGlvbiBpcyB1c2VkIGJ5IExlYWZsZXQgaW50ZXJuYWxseSBmb3IgcGFuIGFuaW1hdGlvbnMuXG4gKi9cblxuTC5Qb3NBbmltYXRpb24gPSBMLkNsYXNzLmV4dGVuZCh7XG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcblxuXHRydW46IGZ1bmN0aW9uIChlbCwgbmV3UG9zLCBkdXJhdGlvbiwgZWFzZUxpbmVhcml0eSkgeyAvLyAoSFRNTEVsZW1lbnQsIFBvaW50WywgTnVtYmVyLCBOdW1iZXJdKVxuXHRcdHRoaXMuc3RvcCgpO1xuXG5cdFx0dGhpcy5fZWwgPSBlbDtcblx0XHR0aGlzLl9pblByb2dyZXNzID0gdHJ1ZTtcblx0XHR0aGlzLl9uZXdQb3MgPSBuZXdQb3M7XG5cblx0XHR0aGlzLmZpcmUoJ3N0YXJ0Jyk7XG5cblx0XHRlbC5zdHlsZVtMLkRvbVV0aWwuVFJBTlNJVElPTl0gPSAnYWxsICcgKyAoZHVyYXRpb24gfHwgMC4yNSkgK1xuXHRcdCAgICAgICAgJ3MgY3ViaWMtYmV6aWVyKDAsMCwnICsgKGVhc2VMaW5lYXJpdHkgfHwgMC41KSArICcsMSknO1xuXG5cdFx0TC5Eb21FdmVudC5vbihlbCwgTC5Eb21VdGlsLlRSQU5TSVRJT05fRU5ELCB0aGlzLl9vblRyYW5zaXRpb25FbmQsIHRoaXMpO1xuXHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbihlbCwgbmV3UG9zKTtcblxuXHRcdC8vIHRvZ2dsZSByZWZsb3csIENocm9tZSBmbGlja2VycyBmb3Igc29tZSByZWFzb24gaWYgeW91IGRvbid0IGRvIHRoaXNcblx0XHRMLlV0aWwuZmFsc2VGbihlbC5vZmZzZXRXaWR0aCk7XG5cblx0XHQvLyB0aGVyZSdzIG5vIG5hdGl2ZSB3YXkgdG8gdHJhY2sgdmFsdWUgdXBkYXRlcyBvZiB0cmFuc2l0aW9uZWQgcHJvcGVydGllcywgc28gd2UgaW1pdGF0ZSB0aGlzXG5cdFx0dGhpcy5fc3RlcFRpbWVyID0gc2V0SW50ZXJ2YWwoTC5iaW5kKHRoaXMuX29uU3RlcCwgdGhpcyksIDUwKTtcblx0fSxcblxuXHRzdG9wOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLl9pblByb2dyZXNzKSB7IHJldHVybjsgfVxuXG5cdFx0Ly8gaWYgd2UganVzdCByZW1vdmVkIHRoZSB0cmFuc2l0aW9uIHByb3BlcnR5LCB0aGUgZWxlbWVudCB3b3VsZCBqdW1wIHRvIGl0cyBmaW5hbCBwb3NpdGlvbixcblx0XHQvLyBzbyB3ZSBuZWVkIHRvIG1ha2UgaXQgc3RheSBhdCB0aGUgY3VycmVudCBwb3NpdGlvblxuXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX2VsLCB0aGlzLl9nZXRQb3MoKSk7XG5cdFx0dGhpcy5fb25UcmFuc2l0aW9uRW5kKCk7XG5cdFx0TC5VdGlsLmZhbHNlRm4odGhpcy5fZWwub2Zmc2V0V2lkdGgpOyAvLyBmb3JjZSByZWZsb3cgaW4gY2FzZSB3ZSBhcmUgYWJvdXQgdG8gc3RhcnQgYSBuZXcgYW5pbWF0aW9uXG5cdH0sXG5cblx0X29uU3RlcDogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBzdGVwUG9zID0gdGhpcy5fZ2V0UG9zKCk7XG5cdFx0aWYgKCFzdGVwUG9zKSB7XG5cdFx0XHR0aGlzLl9vblRyYW5zaXRpb25FbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8ganNoaW50IGNhbWVsY2FzZTogZmFsc2Vcblx0XHQvLyBtYWtlIEwuRG9tVXRpbC5nZXRQb3NpdGlvbiByZXR1cm4gaW50ZXJtZWRpYXRlIHBvc2l0aW9uIHZhbHVlIGR1cmluZyBhbmltYXRpb25cblx0XHR0aGlzLl9lbC5fbGVhZmxldF9wb3MgPSBzdGVwUG9zO1xuXG5cdFx0dGhpcy5maXJlKCdzdGVwJyk7XG5cdH0sXG5cblx0Ly8geW91IGNhbid0IGVhc2lseSBnZXQgaW50ZXJtZWRpYXRlIHZhbHVlcyBvZiBwcm9wZXJ0aWVzIGFuaW1hdGVkIHdpdGggQ1NTMyBUcmFuc2l0aW9ucyxcblx0Ly8gd2UgbmVlZCB0byBwYXJzZSBjb21wdXRlZCBzdHlsZSAoaW4gY2FzZSBvZiB0cmFuc2Zvcm0gaXQgcmV0dXJucyBtYXRyaXggc3RyaW5nKVxuXG5cdF90cmFuc2Zvcm1SZTogLyhbLStdPyg/OlxcZCpcXC4pP1xcZCspXFxEKiwgKFstK10/KD86XFxkKlxcLik/XFxkKylcXEQqXFwpLyxcblxuXHRfZ2V0UG9zOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGxlZnQsIHRvcCwgbWF0Y2hlcyxcblx0XHQgICAgZWwgPSB0aGlzLl9lbCxcblx0XHQgICAgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XG5cblx0XHRpZiAoTC5Ccm93c2VyLmFueTNkKSB7XG5cdFx0XHRtYXRjaGVzID0gc3R5bGVbTC5Eb21VdGlsLlRSQU5TRk9STV0ubWF0Y2godGhpcy5fdHJhbnNmb3JtUmUpO1xuXHRcdFx0aWYgKCFtYXRjaGVzKSB7IHJldHVybjsgfVxuXHRcdFx0bGVmdCA9IHBhcnNlRmxvYXQobWF0Y2hlc1sxXSk7XG5cdFx0XHR0b3AgID0gcGFyc2VGbG9hdChtYXRjaGVzWzJdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGVmdCA9IHBhcnNlRmxvYXQoc3R5bGUubGVmdCk7XG5cdFx0XHR0b3AgID0gcGFyc2VGbG9hdChzdHlsZS50b3ApO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTC5Qb2ludChsZWZ0LCB0b3AsIHRydWUpO1xuXHR9LFxuXG5cdF9vblRyYW5zaXRpb25FbmQ6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9lbCwgTC5Eb21VdGlsLlRSQU5TSVRJT05fRU5ELCB0aGlzLl9vblRyYW5zaXRpb25FbmQsIHRoaXMpO1xuXG5cdFx0aWYgKCF0aGlzLl9pblByb2dyZXNzKSB7IHJldHVybjsgfVxuXHRcdHRoaXMuX2luUHJvZ3Jlc3MgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2VsLnN0eWxlW0wuRG9tVXRpbC5UUkFOU0lUSU9OXSA9ICcnO1xuXG5cdFx0Ly8ganNoaW50IGNhbWVsY2FzZTogZmFsc2Vcblx0XHQvLyBtYWtlIHN1cmUgTC5Eb21VdGlsLmdldFBvc2l0aW9uIHJldHVybnMgdGhlIGZpbmFsIHBvc2l0aW9uIHZhbHVlIGFmdGVyIGFuaW1hdGlvblxuXHRcdHRoaXMuX2VsLl9sZWFmbGV0X3BvcyA9IHRoaXMuX25ld1BvcztcblxuXHRcdGNsZWFySW50ZXJ2YWwodGhpcy5fc3RlcFRpbWVyKTtcblxuXHRcdHRoaXMuZmlyZSgnc3RlcCcpLmZpcmUoJ2VuZCcpO1xuXHR9XG5cbn0pO1xuXG5cbi8qXG4gKiBFeHRlbmRzIEwuTWFwIHRvIGhhbmRsZSBwYW5uaW5nIGFuaW1hdGlvbnMuXG4gKi9cblxuTC5NYXAuaW5jbHVkZSh7XG5cblx0c2V0VmlldzogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgb3B0aW9ucykge1xuXG5cdFx0em9vbSA9IHpvb20gPT09IHVuZGVmaW5lZCA/IHRoaXMuX3pvb20gOiB0aGlzLl9saW1pdFpvb20oem9vbSk7XG5cdFx0Y2VudGVyID0gdGhpcy5fbGltaXRDZW50ZXIoTC5sYXRMbmcoY2VudGVyKSwgem9vbSwgdGhpcy5vcHRpb25zLm1heEJvdW5kcyk7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHRpZiAodGhpcy5fcGFuQW5pbSkge1xuXHRcdFx0dGhpcy5fcGFuQW5pbS5zdG9wKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCAmJiAhb3B0aW9ucy5yZXNldCAmJiBvcHRpb25zICE9PSB0cnVlKSB7XG5cblx0XHRcdGlmIChvcHRpb25zLmFuaW1hdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRvcHRpb25zLnpvb20gPSBMLmV4dGVuZCh7YW5pbWF0ZTogb3B0aW9ucy5hbmltYXRlfSwgb3B0aW9ucy56b29tKTtcblx0XHRcdFx0b3B0aW9ucy5wYW4gPSBMLmV4dGVuZCh7YW5pbWF0ZTogb3B0aW9ucy5hbmltYXRlfSwgb3B0aW9ucy5wYW4pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB0cnkgYW5pbWF0aW5nIHBhbiBvciB6b29tXG5cdFx0XHR2YXIgYW5pbWF0ZWQgPSAodGhpcy5fem9vbSAhPT0gem9vbSkgP1xuXHRcdFx0XHR0aGlzLl90cnlBbmltYXRlZFpvb20gJiYgdGhpcy5fdHJ5QW5pbWF0ZWRab29tKGNlbnRlciwgem9vbSwgb3B0aW9ucy56b29tKSA6XG5cdFx0XHRcdHRoaXMuX3RyeUFuaW1hdGVkUGFuKGNlbnRlciwgb3B0aW9ucy5wYW4pO1xuXG5cdFx0XHRpZiAoYW5pbWF0ZWQpIHtcblx0XHRcdFx0Ly8gcHJldmVudCByZXNpemUgaGFuZGxlciBjYWxsLCB0aGUgdmlldyB3aWxsIHJlZnJlc2ggYWZ0ZXIgYW5pbWF0aW9uIGFueXdheVxuXHRcdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fc2l6ZVRpbWVyKTtcblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYW5pbWF0aW9uIGRpZG4ndCBzdGFydCwganVzdCByZXNldCB0aGUgbWFwIHZpZXdcblx0XHR0aGlzLl9yZXNldFZpZXcoY2VudGVyLCB6b29tKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHBhbkJ5OiBmdW5jdGlvbiAob2Zmc2V0LCBvcHRpb25zKSB7XG5cdFx0b2Zmc2V0ID0gTC5wb2ludChvZmZzZXQpLnJvdW5kKCk7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHRpZiAoIW9mZnNldC54ICYmICFvZmZzZXQueSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9wYW5BbmltKSB7XG5cdFx0XHR0aGlzLl9wYW5BbmltID0gbmV3IEwuUG9zQW5pbWF0aW9uKCk7XG5cblx0XHRcdHRoaXMuX3BhbkFuaW0ub24oe1xuXHRcdFx0XHQnc3RlcCc6IHRoaXMuX29uUGFuVHJhbnNpdGlvblN0ZXAsXG5cdFx0XHRcdCdlbmQnOiB0aGlzLl9vblBhblRyYW5zaXRpb25FbmRcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblxuXHRcdC8vIGRvbid0IGZpcmUgbW92ZXN0YXJ0IGlmIGFuaW1hdGluZyBpbmVydGlhXG5cdFx0aWYgKCFvcHRpb25zLm5vTW92ZVN0YXJ0KSB7XG5cdFx0XHR0aGlzLmZpcmUoJ21vdmVzdGFydCcpO1xuXHRcdH1cblxuXHRcdC8vIGFuaW1hdGUgcGFuIHVubGVzcyBhbmltYXRlOiBmYWxzZSBzcGVjaWZpZWRcblx0XHRpZiAob3B0aW9ucy5hbmltYXRlICE9PSBmYWxzZSkge1xuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX21hcFBhbmUsICdsZWFmbGV0LXBhbi1hbmltJyk7XG5cblx0XHRcdHZhciBuZXdQb3MgPSB0aGlzLl9nZXRNYXBQYW5lUG9zKCkuc3VidHJhY3Qob2Zmc2V0KTtcblx0XHRcdHRoaXMuX3BhbkFuaW0ucnVuKHRoaXMuX21hcFBhbmUsIG5ld1Bvcywgb3B0aW9ucy5kdXJhdGlvbiB8fCAwLjI1LCBvcHRpb25zLmVhc2VMaW5lYXJpdHkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yYXdQYW5CeShvZmZzZXQpO1xuXHRcdFx0dGhpcy5maXJlKCdtb3ZlJykuZmlyZSgnbW92ZWVuZCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdF9vblBhblRyYW5zaXRpb25TdGVwOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5maXJlKCdtb3ZlJyk7XG5cdH0sXG5cblx0X29uUGFuVHJhbnNpdGlvbkVuZDogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aGlzLl9tYXBQYW5lLCAnbGVhZmxldC1wYW4tYW5pbScpO1xuXHRcdHRoaXMuZmlyZSgnbW92ZWVuZCcpO1xuXHR9LFxuXG5cdF90cnlBbmltYXRlZFBhbjogZnVuY3Rpb24gKGNlbnRlciwgb3B0aW9ucykge1xuXHRcdC8vIGRpZmZlcmVuY2UgYmV0d2VlbiB0aGUgbmV3IGFuZCBjdXJyZW50IGNlbnRlcnMgaW4gcGl4ZWxzXG5cdFx0dmFyIG9mZnNldCA9IHRoaXMuX2dldENlbnRlck9mZnNldChjZW50ZXIpLl9mbG9vcigpO1xuXG5cdFx0Ly8gZG9uJ3QgYW5pbWF0ZSB0b28gZmFyIHVubGVzcyBhbmltYXRlOiB0cnVlIHNwZWNpZmllZCBpbiBvcHRpb25zXG5cdFx0aWYgKChvcHRpb25zICYmIG9wdGlvbnMuYW5pbWF0ZSkgIT09IHRydWUgJiYgIXRoaXMuZ2V0U2l6ZSgpLmNvbnRhaW5zKG9mZnNldCkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHR0aGlzLnBhbkJ5KG9mZnNldCwgb3B0aW9ucyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufSk7XG5cblxuLypcbiAqIEwuUG9zQW5pbWF0aW9uIGZhbGxiYWNrIGltcGxlbWVudGF0aW9uIHRoYXQgcG93ZXJzIExlYWZsZXQgcGFuIGFuaW1hdGlvbnNcbiAqIGluIGJyb3dzZXJzIHRoYXQgZG9uJ3Qgc3VwcG9ydCBDU1MzIFRyYW5zaXRpb25zLlxuICovXG5cbkwuUG9zQW5pbWF0aW9uID0gTC5Eb21VdGlsLlRSQU5TSVRJT04gPyBMLlBvc0FuaW1hdGlvbiA6IEwuUG9zQW5pbWF0aW9uLmV4dGVuZCh7XG5cblx0cnVuOiBmdW5jdGlvbiAoZWwsIG5ld1BvcywgZHVyYXRpb24sIGVhc2VMaW5lYXJpdHkpIHsgLy8gKEhUTUxFbGVtZW50LCBQb2ludFssIE51bWJlciwgTnVtYmVyXSlcblx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdHRoaXMuX2VsID0gZWw7XG5cdFx0dGhpcy5faW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0dGhpcy5fZHVyYXRpb24gPSBkdXJhdGlvbiB8fCAwLjI1O1xuXHRcdHRoaXMuX2Vhc2VPdXRQb3dlciA9IDEgLyBNYXRoLm1heChlYXNlTGluZWFyaXR5IHx8IDAuNSwgMC4yKTtcblxuXHRcdHRoaXMuX3N0YXJ0UG9zID0gTC5Eb21VdGlsLmdldFBvc2l0aW9uKGVsKTtcblx0XHR0aGlzLl9vZmZzZXQgPSBuZXdQb3Muc3VidHJhY3QodGhpcy5fc3RhcnRQb3MpO1xuXHRcdHRoaXMuX3N0YXJ0VGltZSA9ICtuZXcgRGF0ZSgpO1xuXG5cdFx0dGhpcy5maXJlKCdzdGFydCcpO1xuXG5cdFx0dGhpcy5fYW5pbWF0ZSgpO1xuXHR9LFxuXG5cdHN0b3A6IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXRoaXMuX2luUHJvZ3Jlc3MpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLl9zdGVwKCk7XG5cdFx0dGhpcy5fY29tcGxldGUoKTtcblx0fSxcblxuXHRfYW5pbWF0ZTogZnVuY3Rpb24gKCkge1xuXHRcdC8vIGFuaW1hdGlvbiBsb29wXG5cdFx0dGhpcy5fYW5pbUlkID0gTC5VdGlsLnJlcXVlc3RBbmltRnJhbWUodGhpcy5fYW5pbWF0ZSwgdGhpcyk7XG5cdFx0dGhpcy5fc3RlcCgpO1xuXHR9LFxuXG5cdF9zdGVwOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGVsYXBzZWQgPSAoK25ldyBEYXRlKCkpIC0gdGhpcy5fc3RhcnRUaW1lLFxuXHRcdCAgICBkdXJhdGlvbiA9IHRoaXMuX2R1cmF0aW9uICogMTAwMDtcblxuXHRcdGlmIChlbGFwc2VkIDwgZHVyYXRpb24pIHtcblx0XHRcdHRoaXMuX3J1bkZyYW1lKHRoaXMuX2Vhc2VPdXQoZWxhcHNlZCAvIGR1cmF0aW9uKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3J1bkZyYW1lKDEpO1xuXHRcdFx0dGhpcy5fY29tcGxldGUoKTtcblx0XHR9XG5cdH0sXG5cblx0X3J1bkZyYW1lOiBmdW5jdGlvbiAocHJvZ3Jlc3MpIHtcblx0XHR2YXIgcG9zID0gdGhpcy5fc3RhcnRQb3MuYWRkKHRoaXMuX29mZnNldC5tdWx0aXBseUJ5KHByb2dyZXNzKSk7XG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX2VsLCBwb3MpO1xuXG5cdFx0dGhpcy5maXJlKCdzdGVwJyk7XG5cdH0sXG5cblx0X2NvbXBsZXRlOiBmdW5jdGlvbiAoKSB7XG5cdFx0TC5VdGlsLmNhbmNlbEFuaW1GcmFtZSh0aGlzLl9hbmltSWQpO1xuXG5cdFx0dGhpcy5faW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdHRoaXMuZmlyZSgnZW5kJyk7XG5cdH0sXG5cblx0X2Vhc2VPdXQ6IGZ1bmN0aW9uICh0KSB7XG5cdFx0cmV0dXJuIDEgLSBNYXRoLnBvdygxIC0gdCwgdGhpcy5fZWFzZU91dFBvd2VyKTtcblx0fVxufSk7XG5cblxuLypcbiAqIEV4dGVuZHMgTC5NYXAgdG8gaGFuZGxlIHpvb20gYW5pbWF0aW9ucy5cbiAqL1xuXG5MLk1hcC5tZXJnZU9wdGlvbnMoe1xuXHR6b29tQW5pbWF0aW9uOiB0cnVlLFxuXHR6b29tQW5pbWF0aW9uVGhyZXNob2xkOiA0XG59KTtcblxuaWYgKEwuRG9tVXRpbC5UUkFOU0lUSU9OKSB7XG5cblx0TC5NYXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXHRcdC8vIGRvbid0IGFuaW1hdGUgb24gYnJvd3NlcnMgd2l0aG91dCBoYXJkd2FyZS1hY2NlbGVyYXRlZCB0cmFuc2l0aW9ucyBvciBvbGQgQW5kcm9pZC9PcGVyYVxuXHRcdHRoaXMuX3pvb21BbmltYXRlZCA9IHRoaXMub3B0aW9ucy56b29tQW5pbWF0aW9uICYmIEwuRG9tVXRpbC5UUkFOU0lUSU9OICYmXG5cdFx0XHRcdEwuQnJvd3Nlci5hbnkzZCAmJiAhTC5Ccm93c2VyLmFuZHJvaWQyMyAmJiAhTC5Ccm93c2VyLm1vYmlsZU9wZXJhO1xuXG5cdFx0Ly8gem9vbSB0cmFuc2l0aW9ucyBydW4gd2l0aCB0aGUgc2FtZSBkdXJhdGlvbiBmb3IgYWxsIGxheWVycywgc28gaWYgb25lIG9mIHRyYW5zaXRpb25lbmQgZXZlbnRzXG5cdFx0Ly8gaGFwcGVucyBhZnRlciBzdGFydGluZyB6b29tIGFuaW1hdGlvbiAocHJvcGFnYXRpbmcgdG8gdGhlIG1hcCBwYW5lKSwgd2Uga25vdyB0aGF0IGl0IGVuZGVkIGdsb2JhbGx5XG5cdFx0aWYgKHRoaXMuX3pvb21BbmltYXRlZCkge1xuXHRcdFx0TC5Eb21FdmVudC5vbih0aGlzLl9tYXBQYW5lLCBMLkRvbVV0aWwuVFJBTlNJVElPTl9FTkQsIHRoaXMuX2NhdGNoVHJhbnNpdGlvbkVuZCwgdGhpcyk7XG5cdFx0fVxuXHR9KTtcbn1cblxuTC5NYXAuaW5jbHVkZSghTC5Eb21VdGlsLlRSQU5TSVRJT04gPyB7fSA6IHtcblxuXHRfY2F0Y2hUcmFuc2l0aW9uRW5kOiBmdW5jdGlvbiAoZSkge1xuXHRcdGlmICh0aGlzLl9hbmltYXRpbmdab29tICYmIGUucHJvcGVydHlOYW1lLmluZGV4T2YoJ3RyYW5zZm9ybScpID49IDApIHtcblx0XHRcdHRoaXMuX29uWm9vbVRyYW5zaXRpb25FbmQoKTtcblx0XHR9XG5cdH0sXG5cblx0X25vdGhpbmdUb0FuaW1hdGU6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gIXRoaXMuX2NvbnRhaW5lci5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdsZWFmbGV0LXpvb20tYW5pbWF0ZWQnKS5sZW5ndGg7XG5cdH0sXG5cblx0X3RyeUFuaW1hdGVkWm9vbTogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgb3B0aW9ucykge1xuXG5cdFx0aWYgKHRoaXMuX2FuaW1hdGluZ1pvb20pIHsgcmV0dXJuIHRydWU7IH1cblxuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0Ly8gZG9uJ3QgYW5pbWF0ZSBpZiBkaXNhYmxlZCwgbm90IHN1cHBvcnRlZCBvciB6b29tIGRpZmZlcmVuY2UgaXMgdG9vIGxhcmdlXG5cdFx0aWYgKCF0aGlzLl96b29tQW5pbWF0ZWQgfHwgb3B0aW9ucy5hbmltYXRlID09PSBmYWxzZSB8fCB0aGlzLl9ub3RoaW5nVG9BbmltYXRlKCkgfHxcblx0XHQgICAgICAgIE1hdGguYWJzKHpvb20gLSB0aGlzLl96b29tKSA+IHRoaXMub3B0aW9ucy56b29tQW5pbWF0aW9uVGhyZXNob2xkKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0Ly8gb2Zmc2V0IGlzIHRoZSBwaXhlbCBjb29yZHMgb2YgdGhlIHpvb20gb3JpZ2luIHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IGNlbnRlclxuXHRcdHZhciBzY2FsZSA9IHRoaXMuZ2V0Wm9vbVNjYWxlKHpvb20pLFxuXHRcdCAgICBvZmZzZXQgPSB0aGlzLl9nZXRDZW50ZXJPZmZzZXQoY2VudGVyKS5fZGl2aWRlQnkoMSAtIDEgLyBzY2FsZSksXG5cdFx0XHRvcmlnaW4gPSB0aGlzLl9nZXRDZW50ZXJMYXllclBvaW50KCkuX2FkZChvZmZzZXQpO1xuXG5cdFx0Ly8gZG9uJ3QgYW5pbWF0ZSBpZiB0aGUgem9vbSBvcmlnaW4gaXNuJ3Qgd2l0aGluIG9uZSBzY3JlZW4gZnJvbSB0aGUgY3VycmVudCBjZW50ZXIsIHVubGVzcyBmb3JjZWRcblx0XHRpZiAob3B0aW9ucy5hbmltYXRlICE9PSB0cnVlICYmICF0aGlzLmdldFNpemUoKS5jb250YWlucyhvZmZzZXQpKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0dGhpc1xuXHRcdCAgICAuZmlyZSgnbW92ZXN0YXJ0Jylcblx0XHQgICAgLmZpcmUoJ3pvb21zdGFydCcpO1xuXG5cdFx0dGhpcy5fYW5pbWF0ZVpvb20oY2VudGVyLCB6b29tLCBvcmlnaW4sIHNjYWxlLCBudWxsLCB0cnVlKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9LFxuXG5cdF9hbmltYXRlWm9vbTogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgb3JpZ2luLCBzY2FsZSwgZGVsdGEsIGJhY2t3YXJkcywgZm9yVG91Y2hab29tKSB7XG5cblx0XHRpZiAoIWZvclRvdWNoWm9vbSkge1xuXHRcdFx0dGhpcy5fYW5pbWF0aW5nWm9vbSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gcHV0IHRyYW5zZm9ybSB0cmFuc2l0aW9uIG9uIGFsbCBsYXllcnMgd2l0aCBsZWFmbGV0LXpvb20tYW5pbWF0ZWQgY2xhc3Ncblx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fbWFwUGFuZSwgJ2xlYWZsZXQtem9vbS1hbmltJyk7XG5cblx0XHQvLyByZW1lbWJlciB3aGF0IGNlbnRlci96b29tIHRvIHNldCBhZnRlciBhbmltYXRpb25cblx0XHR0aGlzLl9hbmltYXRlVG9DZW50ZXIgPSBjZW50ZXI7XG5cdFx0dGhpcy5fYW5pbWF0ZVRvWm9vbSA9IHpvb207XG5cblx0XHQvLyBkaXNhYmxlIGFueSBkcmFnZ2luZyBkdXJpbmcgYW5pbWF0aW9uXG5cdFx0aWYgKEwuRHJhZ2dhYmxlKSB7XG5cdFx0XHRMLkRyYWdnYWJsZS5fZGlzYWJsZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdEwuVXRpbC5yZXF1ZXN0QW5pbUZyYW1lKGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuZmlyZSgnem9vbWFuaW0nLCB7XG5cdFx0XHRcdGNlbnRlcjogY2VudGVyLFxuXHRcdFx0XHR6b29tOiB6b29tLFxuXHRcdFx0XHRvcmlnaW46IG9yaWdpbixcblx0XHRcdFx0c2NhbGU6IHNjYWxlLFxuXHRcdFx0XHRkZWx0YTogZGVsdGEsXG5cdFx0XHRcdGJhY2t3YXJkczogYmFja3dhcmRzXG5cdFx0XHR9KTtcblx0XHRcdC8vIGhvcnJpYmxlIGhhY2sgdG8gd29yayBhcm91bmQgYSBDaHJvbWUgYnVnIGh0dHBzOi8vZ2l0aHViLmNvbS9MZWFmbGV0L0xlYWZsZXQvaXNzdWVzLzM2ODlcblx0XHRcdHNldFRpbWVvdXQoTC5iaW5kKHRoaXMuX29uWm9vbVRyYW5zaXRpb25FbmQsIHRoaXMpLCAyNTApO1xuXHRcdH0sIHRoaXMpO1xuXHR9LFxuXG5cdF9vblpvb21UcmFuc2l0aW9uRW5kOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLl9hbmltYXRpbmdab29tKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5fYW5pbWF0aW5nWm9vbSA9IGZhbHNlO1xuXG5cdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX21hcFBhbmUsICdsZWFmbGV0LXpvb20tYW5pbScpO1xuXG5cdFx0dGhpcy5fcmVzZXRWaWV3KHRoaXMuX2FuaW1hdGVUb0NlbnRlciwgdGhpcy5fYW5pbWF0ZVRvWm9vbSwgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRpZiAoTC5EcmFnZ2FibGUpIHtcblx0XHRcdEwuRHJhZ2dhYmxlLl9kaXNhYmxlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxufSk7XG5cblxuLypcblx0Wm9vbSBhbmltYXRpb24gbG9naWMgZm9yIEwuVGlsZUxheWVyLlxuKi9cblxuTC5UaWxlTGF5ZXIuaW5jbHVkZSh7XG5cdF9hbmltYXRlWm9vbTogZnVuY3Rpb24gKGUpIHtcblx0XHRpZiAoIXRoaXMuX2FuaW1hdGluZykge1xuXHRcdFx0dGhpcy5fYW5pbWF0aW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3ByZXBhcmVCZ0J1ZmZlcigpO1xuXHRcdH1cblxuXHRcdHZhciBiZyA9IHRoaXMuX2JnQnVmZmVyLFxuXHRcdCAgICB0cmFuc2Zvcm0gPSBMLkRvbVV0aWwuVFJBTlNGT1JNLFxuXHRcdCAgICBpbml0aWFsVHJhbnNmb3JtID0gZS5kZWx0YSA/IEwuRG9tVXRpbC5nZXRUcmFuc2xhdGVTdHJpbmcoZS5kZWx0YSkgOiBiZy5zdHlsZVt0cmFuc2Zvcm1dLFxuXHRcdCAgICBzY2FsZVN0ciA9IEwuRG9tVXRpbC5nZXRTY2FsZVN0cmluZyhlLnNjYWxlLCBlLm9yaWdpbik7XG5cblx0XHRiZy5zdHlsZVt0cmFuc2Zvcm1dID0gZS5iYWNrd2FyZHMgP1xuXHRcdFx0XHRzY2FsZVN0ciArICcgJyArIGluaXRpYWxUcmFuc2Zvcm0gOlxuXHRcdFx0XHRpbml0aWFsVHJhbnNmb3JtICsgJyAnICsgc2NhbGVTdHI7XG5cdH0sXG5cblx0X2VuZFpvb21BbmltOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGZyb250ID0gdGhpcy5fdGlsZUNvbnRhaW5lcixcblx0XHQgICAgYmcgPSB0aGlzLl9iZ0J1ZmZlcjtcblxuXHRcdGZyb250LnN0eWxlLnZpc2liaWxpdHkgPSAnJztcblx0XHRmcm9udC5wYXJlbnROb2RlLmFwcGVuZENoaWxkKGZyb250KTsgLy8gQnJpbmcgdG8gZm9yZVxuXG5cdFx0Ly8gZm9yY2UgcmVmbG93XG5cdFx0TC5VdGlsLmZhbHNlRm4oYmcub2Zmc2V0V2lkdGgpO1xuXG5cdFx0dmFyIHpvb20gPSB0aGlzLl9tYXAuZ2V0Wm9vbSgpO1xuXHRcdGlmICh6b29tID4gdGhpcy5vcHRpb25zLm1heFpvb20gfHwgem9vbSA8IHRoaXMub3B0aW9ucy5taW5ab29tKSB7XG5cdFx0XHR0aGlzLl9jbGVhckJnQnVmZmVyKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYW5pbWF0aW5nID0gZmFsc2U7XG5cdH0sXG5cblx0X2NsZWFyQmdCdWZmZXI6IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwO1xuXG5cdFx0aWYgKG1hcCAmJiAhbWFwLl9hbmltYXRpbmdab29tICYmICFtYXAudG91Y2hab29tLl96b29taW5nKSB7XG5cdFx0XHR0aGlzLl9iZ0J1ZmZlci5pbm5lckhUTUwgPSAnJztcblx0XHRcdHRoaXMuX2JnQnVmZmVyLnN0eWxlW0wuRG9tVXRpbC5UUkFOU0ZPUk1dID0gJyc7XG5cdFx0fVxuXHR9LFxuXG5cdF9wcmVwYXJlQmdCdWZmZXI6IGZ1bmN0aW9uICgpIHtcblxuXHRcdHZhciBmcm9udCA9IHRoaXMuX3RpbGVDb250YWluZXIsXG5cdFx0ICAgIGJnID0gdGhpcy5fYmdCdWZmZXI7XG5cblx0XHQvLyBpZiBmb3JlZ3JvdW5kIGxheWVyIGRvZXNuJ3QgaGF2ZSBtYW55IHRpbGVzIGJ1dCBiZyBsYXllciBkb2VzLFxuXHRcdC8vIGtlZXAgdGhlIGV4aXN0aW5nIGJnIGxheWVyIGFuZCBqdXN0IHpvb20gaXQgc29tZSBtb3JlXG5cblx0XHR2YXIgYmdMb2FkZWQgPSB0aGlzLl9nZXRMb2FkZWRUaWxlc1BlcmNlbnRhZ2UoYmcpLFxuXHRcdCAgICBmcm9udExvYWRlZCA9IHRoaXMuX2dldExvYWRlZFRpbGVzUGVyY2VudGFnZShmcm9udCk7XG5cblx0XHRpZiAoYmcgJiYgYmdMb2FkZWQgPiAwLjUgJiYgZnJvbnRMb2FkZWQgPCAwLjUpIHtcblxuXHRcdFx0ZnJvbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdFx0dGhpcy5fc3RvcExvYWRpbmdJbWFnZXMoZnJvbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHByZXBhcmUgdGhlIGJ1ZmZlciB0byBiZWNvbWUgdGhlIGZyb250IHRpbGUgcGFuZVxuXHRcdGJnLnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0XHRiZy5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9ICcnO1xuXG5cdFx0Ly8gc3dpdGNoIG91dCB0aGUgY3VycmVudCBsYXllciB0byBiZSB0aGUgbmV3IGJnIGxheWVyIChhbmQgdmljZS12ZXJzYSlcblx0XHR0aGlzLl90aWxlQ29udGFpbmVyID0gYmc7XG5cdFx0YmcgPSB0aGlzLl9iZ0J1ZmZlciA9IGZyb250O1xuXG5cdFx0dGhpcy5fc3RvcExvYWRpbmdJbWFnZXMoYmcpO1xuXG5cdFx0Ly9wcmV2ZW50IGJnIGJ1ZmZlciBmcm9tIGNsZWFyaW5nIHJpZ2h0IGFmdGVyIHpvb21cblx0XHRjbGVhclRpbWVvdXQodGhpcy5fY2xlYXJCZ0J1ZmZlclRpbWVyKTtcblx0fSxcblxuXHRfZ2V0TG9hZGVkVGlsZXNQZXJjZW50YWdlOiBmdW5jdGlvbiAoY29udGFpbmVyKSB7XG5cdFx0dmFyIHRpbGVzID0gY29udGFpbmVyLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdpbWcnKSxcblx0XHQgICAgaSwgbGVuLCBjb3VudCA9IDA7XG5cblx0XHRmb3IgKGkgPSAwLCBsZW4gPSB0aWxlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKHRpbGVzW2ldLmNvbXBsZXRlKSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb3VudCAvIGxlbjtcblx0fSxcblxuXHQvLyBzdG9wcyBsb2FkaW5nIGFsbCB0aWxlcyBpbiB0aGUgYmFja2dyb3VuZCBsYXllclxuXHRfc3RvcExvYWRpbmdJbWFnZXM6IGZ1bmN0aW9uIChjb250YWluZXIpIHtcblx0XHR2YXIgdGlsZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChjb250YWluZXIuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2ltZycpKSxcblx0XHQgICAgaSwgbGVuLCB0aWxlO1xuXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGlsZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHRpbGUgPSB0aWxlc1tpXTtcblxuXHRcdFx0aWYgKCF0aWxlLmNvbXBsZXRlKSB7XG5cdFx0XHRcdHRpbGUub25sb2FkID0gTC5VdGlsLmZhbHNlRm47XG5cdFx0XHRcdHRpbGUub25lcnJvciA9IEwuVXRpbC5mYWxzZUZuO1xuXHRcdFx0XHR0aWxlLnNyYyA9IEwuVXRpbC5lbXB0eUltYWdlVXJsO1xuXG5cdFx0XHRcdHRpbGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aWxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5cbi8qXHJcbiAqIFByb3ZpZGVzIEwuTWFwIHdpdGggY29udmVuaWVudCBzaG9ydGN1dHMgZm9yIHVzaW5nIGJyb3dzZXIgZ2VvbG9jYXRpb24gZmVhdHVyZXMuXHJcbiAqL1xyXG5cclxuTC5NYXAuaW5jbHVkZSh7XHJcblx0X2RlZmF1bHRMb2NhdGVPcHRpb25zOiB7XHJcblx0XHR3YXRjaDogZmFsc2UsXHJcblx0XHRzZXRWaWV3OiBmYWxzZSxcclxuXHRcdG1heFpvb206IEluZmluaXR5LFxyXG5cdFx0dGltZW91dDogMTAwMDAsXHJcblx0XHRtYXhpbXVtQWdlOiAwLFxyXG5cdFx0ZW5hYmxlSGlnaEFjY3VyYWN5OiBmYWxzZVxyXG5cdH0sXHJcblxyXG5cdGxvY2F0ZTogZnVuY3Rpb24gKC8qT2JqZWN0Ki8gb3B0aW9ucykge1xyXG5cclxuXHRcdG9wdGlvbnMgPSB0aGlzLl9sb2NhdGVPcHRpb25zID0gTC5leHRlbmQodGhpcy5fZGVmYXVsdExvY2F0ZU9wdGlvbnMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdGlmICghbmF2aWdhdG9yLmdlb2xvY2F0aW9uKSB7XHJcblx0XHRcdHRoaXMuX2hhbmRsZUdlb2xvY2F0aW9uRXJyb3Ioe1xyXG5cdFx0XHRcdGNvZGU6IDAsXHJcblx0XHRcdFx0bWVzc2FnZTogJ0dlb2xvY2F0aW9uIG5vdCBzdXBwb3J0ZWQuJ1xyXG5cdFx0XHR9KTtcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG9uUmVzcG9uc2UgPSBMLmJpbmQodGhpcy5faGFuZGxlR2VvbG9jYXRpb25SZXNwb25zZSwgdGhpcyksXHJcblx0XHRcdG9uRXJyb3IgPSBMLmJpbmQodGhpcy5faGFuZGxlR2VvbG9jYXRpb25FcnJvciwgdGhpcyk7XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMud2F0Y2gpIHtcclxuXHRcdFx0dGhpcy5fbG9jYXRpb25XYXRjaElkID1cclxuXHRcdFx0ICAgICAgICBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24ud2F0Y2hQb3NpdGlvbihvblJlc3BvbnNlLCBvbkVycm9yLCBvcHRpb25zKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdG5hdmlnYXRvci5nZW9sb2NhdGlvbi5nZXRDdXJyZW50UG9zaXRpb24ob25SZXNwb25zZSwgb25FcnJvciwgb3B0aW9ucyk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzdG9wTG9jYXRlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAobmF2aWdhdG9yLmdlb2xvY2F0aW9uKSB7XHJcblx0XHRcdG5hdmlnYXRvci5nZW9sb2NhdGlvbi5jbGVhcldhdGNoKHRoaXMuX2xvY2F0aW9uV2F0Y2hJZCk7XHJcblx0XHR9XHJcblx0XHRpZiAodGhpcy5fbG9jYXRlT3B0aW9ucykge1xyXG5cdFx0XHR0aGlzLl9sb2NhdGVPcHRpb25zLnNldFZpZXcgPSBmYWxzZTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF9oYW5kbGVHZW9sb2NhdGlvbkVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcclxuXHRcdHZhciBjID0gZXJyb3IuY29kZSxcclxuXHRcdCAgICBtZXNzYWdlID0gZXJyb3IubWVzc2FnZSB8fFxyXG5cdFx0ICAgICAgICAgICAgKGMgPT09IDEgPyAncGVybWlzc2lvbiBkZW5pZWQnIDpcclxuXHRcdCAgICAgICAgICAgIChjID09PSAyID8gJ3Bvc2l0aW9uIHVuYXZhaWxhYmxlJyA6ICd0aW1lb3V0JykpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9sb2NhdGVPcHRpb25zLnNldFZpZXcgJiYgIXRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aGlzLmZpdFdvcmxkKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdsb2NhdGlvbmVycm9yJywge1xyXG5cdFx0XHRjb2RlOiBjLFxyXG5cdFx0XHRtZXNzYWdlOiAnR2VvbG9jYXRpb24gZXJyb3I6ICcgKyBtZXNzYWdlICsgJy4nXHJcblx0XHR9KTtcclxuXHR9LFxyXG5cclxuXHRfaGFuZGxlR2VvbG9jYXRpb25SZXNwb25zZTogZnVuY3Rpb24gKHBvcykge1xyXG5cdFx0dmFyIGxhdCA9IHBvcy5jb29yZHMubGF0aXR1ZGUsXHJcblx0XHQgICAgbG5nID0gcG9zLmNvb3Jkcy5sb25naXR1ZGUsXHJcblx0XHQgICAgbGF0bG5nID0gbmV3IEwuTGF0TG5nKGxhdCwgbG5nKSxcclxuXHJcblx0XHQgICAgbGF0QWNjdXJhY3kgPSAxODAgKiBwb3MuY29vcmRzLmFjY3VyYWN5IC8gNDAwNzUwMTcsXHJcblx0XHQgICAgbG5nQWNjdXJhY3kgPSBsYXRBY2N1cmFjeSAvIE1hdGguY29zKEwuTGF0TG5nLkRFR19UT19SQUQgKiBsYXQpLFxyXG5cclxuXHRcdCAgICBib3VuZHMgPSBMLmxhdExuZ0JvdW5kcyhcclxuXHRcdCAgICAgICAgICAgIFtsYXQgLSBsYXRBY2N1cmFjeSwgbG5nIC0gbG5nQWNjdXJhY3ldLFxyXG5cdFx0ICAgICAgICAgICAgW2xhdCArIGxhdEFjY3VyYWN5LCBsbmcgKyBsbmdBY2N1cmFjeV0pLFxyXG5cclxuXHRcdCAgICBvcHRpb25zID0gdGhpcy5fbG9jYXRlT3B0aW9ucztcclxuXHJcblx0XHRpZiAob3B0aW9ucy5zZXRWaWV3KSB7XHJcblx0XHRcdHZhciB6b29tID0gTWF0aC5taW4odGhpcy5nZXRCb3VuZHNab29tKGJvdW5kcyksIG9wdGlvbnMubWF4Wm9vbSk7XHJcblx0XHRcdHRoaXMuc2V0VmlldyhsYXRsbmcsIHpvb20pO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBkYXRhID0ge1xyXG5cdFx0XHRsYXRsbmc6IGxhdGxuZyxcclxuXHRcdFx0Ym91bmRzOiBib3VuZHMsXHJcblx0XHRcdHRpbWVzdGFtcDogcG9zLnRpbWVzdGFtcFxyXG5cdFx0fTtcclxuXHJcblx0XHRmb3IgKHZhciBpIGluIHBvcy5jb29yZHMpIHtcclxuXHRcdFx0aWYgKHR5cGVvZiBwb3MuY29vcmRzW2ldID09PSAnbnVtYmVyJykge1xyXG5cdFx0XHRcdGRhdGFbaV0gPSBwb3MuY29vcmRzW2ldO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdsb2NhdGlvbmZvdW5kJywgZGF0YSk7XHJcblx0fVxyXG59KTtcclxuXG5cbn0od2luZG93LCBkb2N1bWVudCkpOyIsInZhciBMID0gcmVxdWlyZSgnbGVhZmxldCcpO1xucmVxdWlyZSgnbGVhZmxldC1kcmF3Jyk7XG5yZXF1aXJlKCcuLi9saWIvTC5JbWFnZVRyYW5zZm9ybScpO1xuXG5jb25zdCBjYXJ0b3VybCA9ICcvL3tzfS5iYXNlbWFwcy5jYXJ0b2Nkbi5jb20vbGlnaHRfYWxsL3t6fS97eH0ve3l9LnBuZyc7XG5jb25zdCBvc211cmwgPSAnLy97c30udGlsZS5vc20ub3JnL3t6fS97eH0ve3l9LnBuZyc7XG5jb25zdCBzdGFtZW51cmwgPSAnLy97c30udGlsZS5zdGFtZW4uY29tL3RvbmVyL3t6fS97eH0ve3l9LnBuZyc7XG5cbmNvbnN0IG9zbSA9IG5ldyBMLlRpbGVMYXllcihzdGFtZW51cmwsIHtcbiAgbWF4Wm9vbTogMThcbn0pO1xuXG5jb25zdCBtYXAgPSBuZXcgTC5NYXAoJ21hcCcsIHtcbiAgbGF5ZXJzOiBbb3NtXSxcbiAgY2VudGVyOiBuZXcgTC5MYXRMbmcoNTUuNzUsIDM3LjYzKSxcbiAgem9vbTogOVxufSk7XG5cbmNvbnN0IGltYWdlTG9hZGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnVwbG9hZCcpO1xuTC5Eb21FdmVudC5vbihpbWFnZUxvYWRlciwgJ2NoYW5nZScsIChlKSA9PiB7XG4gIHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICByZWFkZXIub25sb2FkID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICB2YXIgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcbiAgICBpbWFnZS5zcmMgPSBldmVudC50YXJnZXQucmVzdWx0O1xuXG4gICAgY29uc29sZS5sb2coaW1hZ2Uud2lkdGgsIGltYWdlLmhlaWdodCk7XG4gICAgaW5pdChldmVudC50YXJnZXQucmVzdWx0LCBpbWFnZS53aWR0aCwgaW1hZ2UuaGVpZ2h0KTtcbiAgfVxuICByZWFkZXIucmVhZEFzRGF0YVVSTChlLnRhcmdldC5maWxlc1swXSk7XG59KTtcblxuY29uc3QgZHJvcGJveCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5kcm9wJyk7XG5MLkRvbUV2ZW50XG4gIC5vbihkcm9wYm94LCBcImRyYWdlbnRlclwiLCBMLkRvbUV2ZW50LnN0b3ApXG4gIC5vbihkcm9wYm94LCBcImRyYWdvdmVyXCIsIEwuRG9tRXZlbnQuc3RvcClcbiAgLm9uKGRyb3Bib3gsIFwiZHJvcFwiLCAoZSkgPT4ge1xuICAgIEwuRG9tRXZlbnQuc3RvcChlKTtcbiAgICBpbWFnZUxvYWRlci5maWxlcyA9IGUuZGF0YVRyYW5zZmVyLmZpbGVzO1xuICB9KTtcblxuZnVuY3Rpb24gZ2V0Qm91bmRzKGNlbnRlciwgdywgaCkge1xuICBsZXQgYyA9IG1hcC5sYXRMbmdUb0xheWVyUG9pbnQoY2VudGVyKTtcblxuICBsZXQgbncgPSBtYXAubGF5ZXJQb2ludFRvTGF0TG5nKGMuc3VidHJhY3QoW3cgLyAyLCBoIC8gMl0pKTtcbiAgbGV0IHNlID0gbWFwLmxheWVyUG9pbnRUb0xhdExuZyhjLmFkZChbdyAvIDIsIGggLyAyXSkpO1xuXG4gIHJldHVybiBbXG4gICAgW253LmxhdCwgbncubG5nXSxcbiAgICBbbncubGF0LCBzZS5sbmddLFxuICAgIFtzZS5sYXQsIHNlLmxuZ10sXG4gICAgW3NlLmxhdCwgbncubG5nXVxuICBdO1xufVxuXG5mdW5jdGlvbiBpbml0KHNyYywgdywgaCkge1xuICBsZXQgYW5jaG9ycyA9IGdldEJvdW5kcyhtYXAuZ2V0Q2VudGVyKCksIHcsIGgpO1xuICBsZXQgY2xpcENvb3JkcyA9IGdldEJvdW5kcyhtYXAuZ2V0Q2VudGVyKCksIHcsIGgpO1xuICBsZXQgaW1hZ2UgPSBMLmltYWdlVHJhbnNmb3JtKHNyYywgYW5jaG9ycywge1xuICAgIG9wYWNpdHk6IDAuNSxcbiAgICBjbGlwOiBjbGlwQ29vcmRzLFxuICAgIGRpc2FibGVTZXRDbGlwOiBmYWxzZVxuICB9KS5hZGRUbyhtYXApO1xuXG5cbiAgbGV0IGV4dGVybmFsUG9seWdvbiA9IEwucG9seWdvbihhbmNob3JzLCB7XG4gICAgZmlsbDogZmFsc2VcbiAgfSkuYWRkVG8obWFwKTtcblxuICBsZXQgY2xpcFBvbHlnb24gPSBMLnBvbHlnb24oY2xpcENvb3Jkcywge1xuICAgIGZpbGw6IGZhbHNlLFxuICAgIGNvbG9yOiAncmVkJ1xuICB9KS5hZGRUbyhtYXApO1xuXG4gIGlmICghaW1hZ2Uub3B0aW9ucy5kaXNhYmxlU2V0Q2xpcCkge1xuICAgIGNsaXBQb2x5Z29uLmVkaXRpbmcuZW5hYmxlKCk7XG5cbiAgICBjbGlwUG9seWdvbi5vbignZWRpdCcsIGZ1bmN0aW9uKCkge1xuICAgICAgaW1hZ2Uuc2V0Q2xpcChjbGlwUG9seWdvbi5nZXRMYXRMbmdzKCkpO1xuICAgIH0pO1xuICB9XG5cbiAgTC5Eb21FdmVudC5vbihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcub3BhY2l0eScpLCAnaW5wdXQnLCAoZSkgPT4ge1xuICAgIGltYWdlLm9wdGlvbnMub3BhY2l0eSA9IHRoaXMudmFsdWU7XG4gICAgaW1hZ2UuX3VwZGF0ZU9wYWNpdHkoKTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gdXBkYXRlQW5jaG9ycygpIHtcbiAgICBsZXQgYW5jaG9ycyA9IGFuY2hvck1hcmtlcnMubWFwKChtYXJrZXIpID0+IHtcbiAgICAgIHZhciBsbCA9IG1hcmtlci5nZXRMYXRMbmcoKTtcbiAgICAgIHJldHVybiBsbDtcbiAgICB9KTtcbiAgICBpbWFnZS5zZXRBbmNob3JzKGFuY2hvcnMpO1xuICAgIGV4dGVybmFsUG9seWdvbi5zZXRMYXRMbmdzKGFuY2hvcnMpO1xuICAgIGNsaXBQb2x5Z29uLnNldExhdExuZ3MoaW1hZ2UuZ2V0Q2xpcCgpKTtcblxuICAgIC8vVE9ETzogc3VwcG9ydCBzZXRMYXRMbmdzKCkgTGVhZmxldC5EcmF3XG4gICAgLy9IQUNLOiB1cGRhdGUgZWRpdGluZyBwb2ludHNcbiAgICBpZiAoIWltYWdlLm9wdGlvbnMuZGlzYWJsZVNldENsaXApIHtcbiAgICAgIGNsaXBQb2x5Z29uLmVkaXRpbmcuZGlzYWJsZSgpO1xuICAgICAgY2xpcFBvbHlnb24uZWRpdGluZy5lbmFibGUoKTtcbiAgICB9XG4gIH1cblxuICBsZXQgYW5jaG9yTWFya2VycyA9IGFuY2hvcnMubWFwKChhbmNob3IpID0+IHtcbiAgICByZXR1cm4gTC5tYXJrZXIoYW5jaG9yLCB7XG4gICAgICBkcmFnZ2FibGU6IHRydWVcbiAgICB9KS5hZGRUbyhtYXApLm9uKCdkcmFnJywgdXBkYXRlQW5jaG9ycyk7XG4gIH0pO1xufVxuIl19
