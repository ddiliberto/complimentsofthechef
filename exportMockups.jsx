// Create a log file
var logFile = new File("~/Desktop/illustrator-automation/mockup_generation.log");
logFile.open("w");

// Function to write to both console and log file
function log(message) {
    $.writeln(message);
    logFile.writeln(message);
}

// Add a timestamp to the log for tracking
var startTime = new Date();
log("🚀 MOCKUP_GENERATION_START: " + startTime.toLocaleString());

var exportFolder = Folder("~/Desktop/illustrator-automation/export-mockups/");
var designFolder = Folder("~/Desktop/illustrator-automation/export/");
var inputFiles = designFolder.getFiles("*.png");

// Count variables for summary
var totalDesigns = inputFiles.length;
var totalMockups = 0;
var successfulMockups = 0;

if (totalDesigns === 0) {
    log("❌ MOCKUP_ERROR: No PNG files found in /export/");
} else {
    log("📊 MOCKUP_INFO: Found " + totalDesigns + " designs to process");
    
    var doc = app.activeDocument;
    var backgroundGroup = doc.layerSets.getByName("BACKGROUND");
    var totalColors = backgroundGroup.artLayers.length;
    
    log("📊 MOCKUP_INFO: Found " + totalColors + " color variations");
    log("📊 MOCKUP_INFO: Will generate " + (totalDesigns * totalColors) + " total mockups");

    for (var f = 0; f < inputFiles.length; f++) {
        var designFile = inputFiles[f];
        var designName = designFile.name.replace(".png", "");
        var designPath = File(designFile);
        log("▶ MOCKUP_PROCESSING: " + designName + " (" + (f + 1) + " of " + totalDesigns + ")");

        try {
            var designLayer = doc.artLayers.getByName("design-placement");
            app.activeDocument.activeLayer = designLayer;

            replaceSmartObjectContents(designLayer, designPath);
            resizeAndCenterSmartObject();

            var productFolder = new Folder(exportFolder + "/" + designName);
            if (!productFolder.exists) productFolder.create();

            for (var i = 0; i < backgroundGroup.artLayers.length; i++) {
                var colorLayer = backgroundGroup.artLayers[i];
                totalMockups++;

                for (var j = 0; j < backgroundGroup.artLayers.length; j++) {
                    backgroundGroup.artLayers[j].visible = false;
                }

                colorLayer.visible = true;

                var colorName = colorLayer.name.replace("Color - ", "").replace(/\\s+/g, "-").toUpperCase();
                var exportFile = new File(productFolder + "/" + designName + "-" + colorName + ".png");

                var opts = new ExportOptionsSaveForWeb();
                opts.format = SaveDocumentType.PNG;
                opts.PNG8 = false;
                opts.transparency = true;
                opts.interlaced = false;
                opts.quality = 100;

                doc.exportDocument(exportFile, ExportType.SAVEFORWEB, opts);
                successfulMockups++;
                log("✓ MOCKUP_EXPORTED: " + designName + "-" + colorName);
            }

            log("✅ MOCKUP_COMPLETED: " + designName);
        } catch (e) {
            log("❌ MOCKUP_ERROR: Failed to process " + designName + " - " + e.message);
        }
    }

    var endTime = new Date();
    var duration = (endTime - startTime) / 1000; // in seconds
    
    log("📊 MOCKUP_SUMMARY: Generated " + successfulMockups + " of " + totalMockups + " mockups");
    log("📊 MOCKUP_SUMMARY: Processed " + totalDesigns + " designs");
    log("📊 MOCKUP_SUMMARY: Time taken: " + duration.toFixed(2) + " seconds");
    log("🎉 MOCKUP_GENERATION_COMPLETE");
}

// Close the log file
logFile.close();

// === Replaces the Smart Object contents with the PNG ===
function replaceSmartObjectContents(layer, file) {
    app.activeDocument.activeLayer = layer;
    var idplacedLayerReplaceContents = stringIDToTypeID("placedLayerReplaceContents");
    var desc = new ActionDescriptor();
    desc.putPath(charIDToTypeID("null"), file);
    desc.putInteger(charIDToTypeID("Lnkd"), 0);
    executeAction(idplacedLayerReplaceContents, desc, DialogModes.NO);
}

// === Opens Smart Object, resizes and centers design, saves and closes ===
function resizeAndCenterSmartObject() {
    app.runMenuItem(stringIDToTypeID("placedLayerEditContents"));
    var smartDoc = app.activeDocument;
    var layer = smartDoc.activeLayer;

    var bounds = layer.bounds;
    var width = bounds[2].as("px") - bounds[0].as("px");
    var height = bounds[3].as("px") - bounds[1].as("px");
    var maxSize = 1800;
    var scaleFactor = Math.min(maxSize / width, maxSize / height) * 100;

    layer.resize(scaleFactor, scaleFactor);

    var docCenterX = smartDoc.width.as("px") / 2;
    var docCenterY = smartDoc.height.as("px") / 2;

    var layerCenterX = (layer.bounds[0].as("px") + layer.bounds[2].as("px")) / 2;
    var layerCenterY = (layer.bounds[1].as("px") + layer.bounds[3].as("px")) / 2;

    var offsetX = docCenterX - layerCenterX;
    var offsetY = docCenterY - layerCenterY;

    layer.translate(offsetX, offsetY);
    smartDoc.close(SaveOptions.SAVECHANGES);
}
