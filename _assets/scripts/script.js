function detectExtensions() {
  detectGoogleMaps();
}

function detectGoogleMaps() {
  var elements = document.querySelectorAll(".ext-googlemaps");
  if(elements.length) loadGoogleMaps();
}

function loadGoogleMaps() {
  var hostname = location.hostname;
  var googleUrl = "https://maps.googleapis.com/maps/api/js?callback=initGoogleMaps&libraries=geometry";
  var googleKey = "&key=AIzaSyDXfYkzPkfNqI8ZjHsgzuraxhOjMsPg-O8";

  var s = document.createElement("script");
  s.type = "text/javascript";

  if(hostname === "localhost")
    s.src = googleUrl;
  else if(hostname.match(/korsnack\.kr$/))
    s.src = googleUrl + googleKey;
  else
    s.src = googleUrl;

  document.head.appendChild(s);
}

function initGoogleMaps() {
  var elements = document.querySelectorAll(".ext-googlemaps");

  elements.forEach(function(element) {
    var data = JSON.parse(element.innerHTML);

    element.style.width = data.size[0];
    element.style.height = data.size[1];

    var bound = new google.maps.LatLngBounds();
    for(var object of data.objects) {
      if(object.type === "marker")
        bound.extend({ lat: object.coordinate[1], lng: object.coordinate[0] });
      else if(object.type === "polyline") {
        var path = google.maps.geometry.encoding.decodePath(object.polyline);
        for(var i = 0 ; i < path.length ; i++) bound.extend(path[i]);
      }
    }

    var map = new google.maps.Map(element, {
      center: bound.getCenter(),
      zoom: data.zoom,
    });

    for(var object of data.objects) {
      if(object.type === "marker") {
        var marker = new google.maps.Marker({
          position: { lat: object.coordinate[1], lng: object.coordinate[0] },
          map: map,
        });
      }
      else if(object.type === "polyline") {
        var path = google.maps.geometry.encoding.decodePath(object.polyline);
        var polyline = new google.maps.Polyline({
          path: path,
          strokeColor: object.color,
          strokeWeight: object.width,
          map: map,
        });
      }
    }
  });
}

window.addEventListener("load", detectExtensions);
