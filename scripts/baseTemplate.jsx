var doc = app.open(new File("~/Desktop/illustrator-automation/template.ai"));
var textLayer = doc.textFrames.getByName("wordText");

textLayer.contents = "{{WORD}}";

// Fill
var fillColor = new RGBColor();
fillColor.red = {{FILL_R}};
fillColor.green = {{FILL_G}};
fillColor.blue = {{FILL_B}};
textLayer.textRange.characterAttributes.fillColor = fillColor;

// Stroke
var strokeColor = new RGBColor();
strokeColor.red = {{STROKE_R}};
strokeColor.green = {{STROKE_G}};
strokeColor.blue = {{STROKE_B}};
textLayer.textRange.characterAttributes.strokeColor = strokeColor;
textLayer.textRange.characterAttributes.strokeWeight = 2;

// Resize artboard
var bounds = textLayer.visibleBounds;
doc.artboards[0].artboardRect = [
  bounds[0] - 5,
  bounds[1] + 5,
  bounds[2] + 5,
  bounds[3] - 5
];

// Export
var exportFile = new File("~/Desktop/illustrator-automation/export/{{WORD}}.png");
var options = new ExportOptionsPNG24();
options.horizontalScale = (2000 / (bounds[2] - bounds[0])) * 100;
options.verticalScale = (2000 / (bounds[2] - bounds[0])) * 100;
options.transparency = true;
options.artBoardClipping = true;

doc.exportFile(exportFile, ExportType.PNG24, options);
doc.close(SaveOptions.DONOTSAVECHANGES);
