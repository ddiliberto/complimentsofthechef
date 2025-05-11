var doc = app.open(new File("~/Desktop/illustrator-automation/template.ai"));
var textLayer = doc.textFrames.getByName("wordText");

var word = "YOGURT"; // Change this to your word
textLayer.contents = word;

// 🎨 Set FILL color (Gold)
var fillColor = new RGBColor();
fillColor.red = 186;
fillColor.green = 132;
fillColor.blue = 68;
textLayer.textRange.characterAttributes.fillColor = fillColor;

// 🎨 Set STROKE color (Black)
var strokeColor = new RGBColor();
strokeColor.red = 0;
strokeColor.green = 0;
strokeColor.blue = 0;
textLayer.textRange.characterAttributes.strokeColor = strokeColor;
textLayer.textRange.characterAttributes.strokeWeight = 2;

// Resize artboard to fit text with padding
var bounds = textLayer.visibleBounds;
doc.artboards[0].artboardRect = [
  bounds[0] - 20,
  bounds[1] + 20,
  bounds[2] + 20,
  bounds[3] - 20
];

// Calculate scale to export width = 2000px
var artboardRect = doc.artboards[0].artboardRect;
var artboardWidth = artboardRect[2] - artboardRect[0];
var scale = (2000 / artboardWidth) * 100;

// Export
var exportFile = new File("~/Desktop/export-" + word + ".png");
var options = new ExportOptionsPNG24();
options.horizontalScale = scale;
options.verticalScale = scale;
options.transparency = true;
options.artBoardClipping = true;

doc.exportFile(exportFile, ExportType.PNG24, options);
doc.close(SaveOptions.DONOTSAVECHANGES);
