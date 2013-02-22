// Author: Jeremy Iglehart
// This is a überBuilder Project: http://uberbuilder.github.com/choropleth/
// License Available Here: http://github.com/uberbuilder/choropleth/
//
// --- This is a complete re-write of Code Camp project ---
//
// The original project idea came from the 3rd Philly Give Camp.
// Original Project Contributors: Jeremy Iglehart, Sebastian Meine and Jennifer Voss
// Original Project Source: https://github.com/jennvoss/gpcah-map/

// This should probably change to a jQuery on.doc.load thing...
$(document).ready(function() { init(); });

// Initialize the different constants that this uses to get information from a Google-Drive spreadsheet
var mapKey = "0AhLWjwzZgPNGdEFib2pYeVg1VEU5U0w0MXV5Y254NlE";
var sheetName = 'Hunger Data'
var geoJSONHeaderName = "ubergeojson";
var headersSheetName = "uberMap_meta-data";

var choroplethRangeHeaderName = "foodinsecurityrate";
var choroplethRangeHeaderName_HumanReadable = "";
var choroplethRangeHigh = 0;
var choroplethRangeLow = 0;
var choroplethRangeStep = 0;
var choroplethRangeSteps = [];

// Initialize map specific variables
var defaultMapCenter = [41.05, -77.37]; // A good way to get this number is go to maps.google.com zoom to where you want to center the map - right click and "Drop LatLng marker" copy and paste that little set of numbers in here just the way it is.
var defaultZoomLevel = 7; // Self explanitory: Sets the zoom level from 0 to 18 usually of how close you want to be to the earth when the map loads.  For Pennsylvania it's ~7

// Constants that are needed in multiple places in the app below.
var sheetHeaders = [];
var masterGeoJSON = {
  "type": "FeatureCollection",
  "features": []
  };
var geojson;
var choroplethDataClasses = 6;

// Is in case you're using liquid layouts (in this case bundeled with Jekyll) you need to set a mustache delimiter.
var mustacheSetDelimiter = "{{={u{ }u}=}}";
var controlPannel_clickState = mustacheSetDelimiter;
var controlPannel_hoverState = mustacheSetDelimiter;
var controlPannel_initState = mustacheSetDelimiter;
var controlPannel_legend = mustacheSetDelimiter;

var zoomToJSONObject = L.geoJson(JSON.parse('{"type":"FeatureCollection","features":[{"type":"Feature","id":"USA-PA","properties":{"fips":"42","name":"Pennsylvania"},"geometry":{"type":"Polygon","coordinates":[[[-79.76278,42.252649],[-79.76278,42.000709],[-75.35932,42.000709],[-75.249781,41.863786],[-75.173104,41.869263],[-75.052611,41.754247],[-75.074519,41.60637],[-74.89378,41.436584],[-74.740426,41.431108],[-74.69661,41.359907],[-74.828057,41.288707],[-74.882826,41.179168],[-75.134765,40.971045],[-75.052611,40.866983],[-75.205966,40.691721],[-75.195012,40.576705],[-75.069042,40.543843],[-75.058088,40.417874],[-74.773287,40.215227],[-74.82258,40.127596],[-75.129289,39.963288],[-75.145719,39.88661],[-75.414089,39.804456],[-75.616736,39.831841],[-75.786521,39.722302],[-79.477979,39.722302],[-80.518598,39.722302],[-80.518598,40.636951],[-80.518598,41.978802],[-80.518598,41.978802],[-80.332382,42.033571],[-79.76278,42.269079],[-79.76278,42.252649]]]}}]}'), {style: {opacity: 0, fillOpacity: 0, clickable: false}});

// State Control
var polygonHasFocus = false;
var lastClickedLayer;
var geoJSONLayers = [];

// For formatting my numbers with commas (Thanks StackOverflow: http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript )
Number.prototype.numberFormat = function(decimals, dec_point, thousands_sep) {
  dec_point = typeof dec_point !== 'undefined' ? dec_point : '.';
  thousands_sep = typeof thousands_sep !== 'undefined' ? thousands_sep : ',';

  var parts = this.toFixed(decimals).toString().split(dec_point);
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands_sep);

  return parts.join(dec_point);
}

// init() is where we actually go to the Google-Drive spreadsheet and load the data in.
function init() {
  Tabletop.init( { key: mapKey,
                   callback: processSpreadsheetData,
                   wanted: [sheetName, headersSheetName]
                 });
}

// This is where we actually process all of the data from the Google-Drive spreadsheet
// and populate the masterGeoJSON object to get it ready for the map display function below.
function processSpreadsheetData(data, tabletop) {

  var choroplethRangeCandidate = [];

  // this creates a sheetHeaders[] object that holds two different
  // - properties: humanReadable and machineReadable
  // - sheetHeaders[] is an array that we can step through using forEach (thank you ES5)
  // - to display all of the map properties for each map object when we get to updating the map control layer.
  tabletop.sheets(headersSheetName).elements.forEach( function(element, index) {
    sheetHeaders[index] = {
      machineReadable: tabletop.sheets(sheetName).column_names[index],
      humanReadable: element.uberheaderlabel
    };
    if (sheetHeaders[index].machineReadable === choroplethRangeHeaderName) {
      choroplethRangeHeaderName_HumanReadable = sheetHeaders[index].humanReadable;
    }
  });

  tabletop.sheets(sheetName).elements.forEach(function(element, rowIndex) {
    masterGeoJSON.features[rowIndex] = JSON.parse(element[geoJSONHeaderName]).features[0];
    tabletop.sheets(sheetName).column_names.forEach(function(headerName, headerIndex) {
      if (headerName !== geoJSONHeaderName) {
        if (headerName === "populationreceivingsnap") {
          masterGeoJSON.features[rowIndex].properties[headerName] = Math.round(parseFloat(element[headerName])) + "%";
        } else if (headerName === "foodinsecurityrate" || headerName === "childfoodinsecurityrate") {
          masterGeoJSON.features[rowIndex].properties[headerName] = element[headerName] + "%";
        } else {
          masterGeoJSON.features[rowIndex].properties[headerName] = element[headerName].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
      } else {
        // Do nothing
      }
    });
    choroplethRangeCandidate[rowIndex] = parseFloat(masterGeoJSON.features[rowIndex].properties[choroplethRangeHeaderName]);
  });

  // We used to do all this math to figure out the ranges and automatically build the legend and all that fun stuff.  We ran into some statistical display problems with the automatic iterative design of the algorithym not displaying the proper results.  So, now we just hard code is.  Good news: We get the display to work how we want it to.  Bad news: This has to be done every time you run the report.
  // The below kruft is here if in case we need to go back to automatically calculating this.

  //choroplethRangeHigh = Math.max.apply(null, choroplethRangeCandidate);
  //choroplethRangeLow = Math.min.apply(null, choroplethRangeCandidate);
  //choroplethRangeStep = (choroplethRangeHigh - choroplethRangeLow);

  choroplethRangeSteps[0] = 9.7;
  choroplethRangeSteps[1] = 11.06;
  choroplethRangeSteps[2] = 12.43;
  choroplethRangeSteps[3] = 13.79;
  choroplethRangeSteps[4] = 15.16;
  choroplethRangeSteps[5] = 20;


  //Build the mustache templates
  var legendInstructions = '<p class="legend-instructions">Choose a county below for hunger statistics.</p>'
  controlPannel_initState += legendInstructions;
  controlPannel_hoverState += '<p class="legend-header">{u{countyname}u} County</p><p class="legend-sub-header">(Click the county for more information)</p>';

  controlPannel_clickState += "<ul>";
  sheetHeaders.forEach( function(sheetHeader, sheetHeaderIndex){
    if (sheetHeader.machineReadable !== geoJSONHeaderName) {
      controlPannel_clickState += "<li>" +
        '<span class="map-data-property-label">' + sheetHeader.humanReadable + ": </span>" +
        '<span class="map-data-property-value">' + "{u{" + sheetHeader.machineReadable + "}u}" + "</span>" +
        "</li>";
    }
  });

  controlPannel_clickState += "</ul>";
  controlPannel_legend += '<p class="{u{polygonState}u} uberMap-legend-header">' + choroplethRangeHeaderName_HumanReadable + ':</p>';
  controlPannel_legend += '<ul class="uberMap-legend {u{polygonState}u}">';
  controlPannel_legend += '<li class="legend-item" style="background-color: ' + getColor(0)  + '"></li>';
  controlPannel_legend += '<li class="legend-item" style="background-color: ' + getColor(11.5) + '"></li>';
  controlPannel_legend += '<li class="legend-item" style="background-color: ' + getColor(13) + '"></li>';
  controlPannel_legend += '<li class="legend-item" style="background-color: ' + getColor(15) + '"></li>';
  controlPannel_legend += '<li class="legend-item" style="background-color: ' + getColor(17) + '"></li>';
  controlPannel_legend += '<li class="legend-item" style="background-color: ' + getColor(23) + '"></li>';
  controlPannel_legend += '</ul>';

  // Now that we have actually loaded all of the data from the Google-Drive spreadsheet
  // - go ahead and load masterGeoSJON up to the map.
  loadMapData(masterGeoJSON);
}

// Setup the map to center where you would like it to.  You can always to go maps.google.com and right click anywhere on the map and "Drop LatLng Marker".
var map = L.map('map_test_1', {
  zoomControl: false,
  dragging: false,
  touchZoom: false,
  scrollWheelZoom: false,
  doubleClickZoom: false
});

map.attributionControl.setPrefix('');

// This is where you get your map tiles.  You can get your own free API key from cloudmade.com
// - please replace my key with yours if you're using this code in your own project. v
// - please replace my key with yours if you're using this code in your own project. v
// - please replace my key with yours if you're using this code in your own project. v
// - please replace my key with yours if you're using this code in your own project. v
var cloudmade = L.tileLayer('http://{s}.tile.cloudmade.com/{key}/{styleId}/256/{z}/{x}/{y}.png', {
  attribution: 'Map data &copy; 2011 OpenStreetMap contributors, Imagery &copy; 2011 CloudMade' +
  ' &#x2014; This <a href="http://uberbuilder.github.com/choropleth/">&uuml;berBuilder Project</a> is powered by <a href="http://leafletjs.com">Leaflet</a>',
  key: 'c5007019bb4e4787afb0135c36690912',
  styleId: 86036
}).addTo(map);
// - please replace my key with yours if you're using this code in your own project. ^
// - please replace my key with yours if you're using this code in your own project. ^
// - please replace my key with yours if you're using this code in your own project. ^
// - please replace my key with yours if you're using this code in your own project. ^

// This is where we decide which colors the polygons we draw on the map will be.
function getColor(d) {
  return d >  choroplethRangeSteps[5]   ? '#FC4E2A' :
         d >= choroplethRangeSteps[4]   ? '#FD8D3C' :
         d >= choroplethRangeSteps[3]   ? '#FEB24C' :
         d >= choroplethRangeSteps[2]   ? '#FED976' :
         d >= choroplethRangeSteps[1]   ? '#FFEDA0' :
                                          '#FFFFCC';
}

// [TODO] re-write this to get the styles from a stylesheet instead of hard-coding them here.
// ------  Maybe I won't actually do this since some of these don't really match a CSS standard.
// ------  Maybe the we will css standard the colors?  Some of these things can be set as
// ------  variables at the top of this document... perhaps we'll just set it there due to the
// ------  styleing constraints set forth from our leaflet.js buddies

function style(feature) {
  return {
    fillColor: getColor(parseFloat(feature.properties.foodinsecurityrate)),
    weight: 1,
    opacity: 1,
    color: 'white',
    fillOpacity: 0.8
  };
}

var info = L.control();

info.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
  this.update();
  return this._div;
};

// method that we will use to update the control based on feature properties passed
info.update = function (props, featureEventType) {
  if (props) {
    if (featureEventType === "click") {
      this._div.innerHTML = Mustache.render(controlPannel_clickState, props);
    } else if (featureEventType === "hover") {
      this._div.innerHTML = Mustache.render(controlPannel_hoverState, props);
    }
  } else {
    this._div.innerHTML = Mustache.render(controlPannel_initState);
  }
};

// Legend

var legend = L.control({position: 'bottomleft'});

legend.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info legend');
  this.update();
  return this._div;
};

legend.update = function () {
  if (polygonHasFocus) {
    this._div.innerHTML = Mustache.render(controlPannel_legend, { polygonState: "polygon-has-focus" });
  } else {
    this._div.innerHTML = Mustache.render(controlPannel_legend, { polygonState: "" });
  }
}

// This is what happens when your mouse hovers over a map element.
function highlightFeature(e) {
  var layer = e.target;

  if (!polygonHasFocus) {
    layer.setStyle({
      fillColor: '#78A700',
      fillOpacity: 0.9
    });

    if (!L.Browser.ie && !L.Browser.opera) {
      layer.bringToFront();
    }

    info.update(layer.feature.properties, "hover");
    if (L.Browser.touch) {
      clickFeature(e);
    }
  }
}

function clickFeature(e) {
  var layer = e.target;

  if (polygonHasFocus) {
    map.fitBounds(zoomToJSONObject.getBounds());
    polygonHasFocus = false;
    geojson.resetStyle(lastClickedLayer);
    info.update();
    legend.update();
    geoJSONLayers.forEach(function(thisLayer, layerArrayIndex) {
      geojson.resetStyle(thisLayer);
    });
  } else {
    if (!L.Browser.ie && !L.Browser.opera) {
      layer.bringToFront();
    }
    geoJSONLayers.forEach(function(thisLayer, layerArrayIndex) {
      if (thisLayer === layer) {
        geojson.resetStyle(thisLayer);
        thisLayer.setStyle({
          fillOpacity: .9,
          weight: 0
        });
      } else {
        thisLayer.setStyle({
          fillColor: '#9EA4A1',
          fillOpacity: 0.7,
          weight: 0
        });
      }
    });
    map.fitBounds(layer.getBounds());
    polygonHasFocus = true;
    lastClickedLayer = layer;
    info.update(layer.feature.properties, "click");
    legend.update();
  }
}

// This is what happens when your mouse goes away from an element.
function resetHighlight(e) {
  if (!polygonHasFocus) {
    geojson.resetStyle(e.target);
    info.update();
  }
}

// This is where we assign the behavior to each map element we draw.
function onEachFeature(feature, layer) {
  geoJSONLayers.push(layer);
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: clickFeature
  });
}

// This is the bit where we load all the geoJSON information into the map.
function loadMapData(geoJSONData) {
  zoomToJSONObject.addTo(map);

  geojson = L.geoJson(geoJSONData, {
    style: style,
    onEachFeature: onEachFeature
  }).addTo(map);

  map.fitBounds(zoomToJSONObject.getBounds());
  map.on({
    click: function() {
      map.fitBounds(zoomToJSONObject.getBounds());
      polygonHasFocus = false;
      geojson.resetStyle(lastClickedLayer);
      info.update();
      legend.update();
      geoJSONLayers.forEach(function(thisLayer, layerArrayIndex) {
        geojson.resetStyle(thisLayer);
      });
    },
    zoomend: function() {
      if (polygonHasFocus) {
        map.panBy([200, 0]);
        geoJSONLayers.forEach(function(thisLayer, layerArrayIndex) {
          thisLayer.setStyle({
            weight: 1
          });
        });
      }
    }
  });

  info.addTo(map);
  legend.addTo(map);
}