var doc = app.open(new File("~/Desktop/illustrator-automation/template.ai"));
var textLayer = doc.textFrames.getByName("wordText");

textLayer.contents = "MONJAYAKI";

// Fill
var fillColor = new RGBColor();
fillColor.red = 200;
fillColor.green = 75;
fillColor.blue = 49;
textLayer.textRange.characterAttributes.fillColor = fillColor;

// Stroke
var strokeColor = new RGBColor();
strokeColor.red = 200;
strokeColor.green = 75;
strokeColor.blue = 49;
textLayer.textRange.characterAttributes.strokeColor = strokeColor;
textLayer.textRange.characterAttributes.strokeWeight = 2;

// Resize artboard
var bounds = textLayer.visibleBounds;
doc.artboards[0].artboardRect = [
  bounds[0] - 50,
  bounds[1] + 50,
  bounds[2] + 50,
  bounds[3] - 50
];

// Export
var exportFile = new File("~/Desktop/illustrator-automation/export/MONJAYAKI.png");
var options = new ExportOptionsPNG24();
options.horizontalScale = (2000 / (bounds[2] - bounds[0])) * 100;
options.verticalScale = (2000 / (bounds[2] - bounds[0])) * 100;
options.transparency = true;
options.artBoardClipping = true;

doc.exportFile(exportFile, ExportType.PNG24, options);
doc.close(SaveOptions.DONOTSAVECHANGES);
