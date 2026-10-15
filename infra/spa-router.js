// CloudFront Function (viewer-request) attached to the S3 default behaviour only.
// Requests for real files (anything with an extension, e.g. /assets/index-abc.js)
// pass through; everything else is a React Router path and gets index.html.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
