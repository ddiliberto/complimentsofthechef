var doc = app.open(new File("~/Desktop/illustrator-automation/template.ai"));
var textLayer = doc.textFrames.getByName("wordText");

textLayer.contents = "FLAUTAS";

// Fill
var fillColor = new RGBColor();
fillColor.red = 228;
fillColor.green = 155;
fillColor.blue = 15;
textLayer.textRange.characterAttributes.fillColor = fillColor;

// Stroke
var strokeColor = new RGBColor();
strokeColor.red = 228;
strokeColor.green = 155;
strokeColor.blue = 15;
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
var exportFile = new File("~/Desktop/illustrator-automation/export/FLAUTAS.png");
var options = new ExportOptionsPNG24();
options.horizontalScale = (2000 / (bounds[2] - bounds[0])) * 100;
options.verticalScale = (2000 / (bounds[2] - bounds[0])) * 100;
options.transparency = true;
options.artBoardClipping = true;

doc.exportFile(exportFile, ExportType.PNG24, options);
doc.close(SaveOptions.DONOTSAVECHANGES);
