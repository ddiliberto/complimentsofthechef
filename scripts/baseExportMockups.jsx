// Photoshop JSX Script: Export mockups for each sweatshirt color
// Requirements:
// - Open 'gildan18000-template.psd'
// - Smart Object layer named: design-placement
// - Background color layers named: Color - White, Color - Navy, etc.
// - Your PNG design is located in /export/ and named [WORD].png

// Configuration - will be replaced by generateMockups.js
var designName = "{{DESIGN_NAME}}";

// Paths
var exportFolder = Folder("~/Desktop/illustrator-automation/export-mockups/");
var designFolder = Folder("~/Desktop/illustrator-automation/export/");
var templateFile = File("~/Desktop/illustrator-automation/gildan18000-template.psd");

// Open template file
app.open(templateFile);
var doc = app.activeDocument;

// Design file path
var designPath = File(designFolder + "/" + designName + ".png");

// Smart Object layer
var designLayer = doc.artLayers.getByName("design-placement");
doc.activeLayer = designLayer;

function replaceSmartObjectContents(layer, file) {
    app.activeDocument.activeLayer = layer;
    var idplacedLayerReplaceContents = stringIDToTypeID("placedLayerReplaceContents");
    var desc = new ActionDescriptor();
    desc.putPath(charIDToTypeID("null"), file);
    desc.putInteger(charIDToTypeID("Lnkd"), 0);
    executeAction(idplacedLayerReplaceContents, desc, DialogModes.NO);
}

// Replace design
replaceSmartObjectContents(designLayer, designPath);

// Find BACKGROUND group
var backgroundGroup = doc.layerSets.getByName("BACKGROUND");

// Loop through each color
for (var i = 0; i < backgroundGroup.artLayers.length; i++) {
    var colorLayer = backgroundGroup.artLayers[i];

    // Hide all colors
    for (var j = 0; j < backgroundGroup.artLayers.length; j++) {
        backgroundGroup.artLayers[j].visible = false;
    }

    // Show this color
    colorLayer.visible = true;

    // Get color name
    var colorName = colorLayer.name.replace("Color - ", "").replace(/\s+/g, "-");

    // Create export folder
    var colorExportFolder = new Folder(exportFolder + "/" + colorName);
    if (!colorExportFolder.exists) colorExportFolder.create();

    // Export file
    var exportFile = new File(colorExportFolder + "/" + designName + ".png");
    var opts = new ExportOptionsSaveForWeb();
    opts.format = SaveDocumentType.PNG;
    opts.PNG8 = false;
    opts.transparency = true;
    opts.interlaced = false;
    opts.quality = 100;

    doc.exportDocument(exportFile, ExportType.SAVEFORWEB, opts);
}

// Close document without saving changes
doc.close(SaveOptions.DONOTSAVECHANGES);