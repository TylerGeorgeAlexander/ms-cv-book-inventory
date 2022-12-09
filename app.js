const express = require("express");
const app = express();
const multer = require("multer");
const upload = multer({
  storage: multer.diskStorage({}),
  fileFilter: (req, file, cb) => {
    let ext = path.extname(file.originalname);
    if (ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png") {
      cb(new Error("File type is not supported"), false);
      return;
    }
    cb(null, true);
  },
});

//MS Specific
const axios = require("axios").default;
const async = require("async");
const fs = require("fs");
const https = require("https");
const path = require("path");
const createReadStream = require("fs").createReadStream;
const sleep = require("util").promisify(setTimeout);
const ComputerVisionClient =
  require("@azure/cognitiveservices-computervision").ComputerVisionClient;
const ApiKeyCredentials = require("@azure/ms-rest-js").ApiKeyCredentials;

require("dotenv").config({ path: "./config/.env" });

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const key = process.env.MS_COMPUTER_VISION_SUBSCRIPTION_KEY;
const endpoint = process.env.MS_COMPUTER_VISION_ENDPOINT;
const faceEndpoint = process.env.MS_FACE_ENDPOINT;
const subscriptionKey = process.env.MS_FACE_SUB_KEY;

const computerVisionClient = new ComputerVisionClient(
  new ApiKeyCredentials({ inHeader: { "Ocp-Apim-Subscription-Key": key } }),
  endpoint
);

//Server Setup
app.set("view engine", "ejs");
app.use(express.static("public"));

//Routes
app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.post("/", upload.single("file-to-upload"), async (req, res) => {
  try {
    // Upload image to cloudinary
    const result = await cloudinary.uploader.upload(req.file.path);
    const bookURL = result.secure_url;

    async.series([
      async function () {
        /**
       * OCR: READ PRINTED & HANDWRITTEN TEXT WITH THE READ API
       * Extracts text from images using OCR (optical character recognition).
       */
        console.log('-------------------------------------------------');
        console.log('READ PRINTED, HANDWRITTEN TEXT AND PDF');
        console.log();

        // URL images containing printed and/or handwritten text. 
        // The URL can point to image files (.jpg/.png/.bmp) or multi-page files (.pdf, .tiff).
        // const bookURL = 'https://raw.githubusercontent.com/Azure-Samples/cognitive-services-sample-data-files/master/ComputerVision/Images/printed_text.jpg';

        // Recognize text in printed image from a URL
        console.log('Read printed text from URL...', bookURL.split('/').pop());
        const printedResult = await readTextFromURL(computerVisionClient, bookURL);
        printRecText(printedResult);

        // Perform read and await the result from URL
        async function readTextFromURL(client, url) {
          // To recognize text in a local image, replace client.read() with readTextInStream() as shown:
          let result = await client.read(url);
          // Operation ID is last path segment of operationLocation (a URL)
          let operation = result.operationLocation.split('/').slice(-1)[0];

          // Wait for read recognition to complete
          // result.status is initially undefined, since it's the result of read
          while (result.status !== "succeeded") { await sleep(1000); result = await client.getReadResult(operation); }
          return result.analyzeResult.readResults; // Return the first page of result. Replace [0] with the desired page if this is a multi-page file such as .pdf or .tiff.
        }

        // Prints all text from Read result
        function printRecText(readResults) {
          console.log('Recognized text:');
          for (const page in readResults) {
            if (readResults.length > 1) {
              console.log(`==== Page: ${page}`);
            }
            const result = readResults[page];
            if (result.lines.length) {
              for (const line of result.lines) {
                console.log(line.words.map(w => w.text).join(' '));
              }
            }
            else { console.log('No recognized text.'); }
          }
        }

        /**
         * 
         * Download the specified file in the URL to the current local folder
         * 
         */
        function downloadFilesToLocal(url, localFileName) {
          return new Promise((resolve, reject) => {
            console.log('--- Downloading file to local directory from: ' + url);
            const request = https.request(url, (res) => {
              if (res.statusCode !== 200) {
                console.log(`Download sample file failed. Status code: ${res.statusCode}, Message: ${res.statusMessage}`);
                reject();
              }
              var data = [];
              res.on('data', (chunk) => {
                data.push(chunk);
              });
              res.on('end', () => {
                console.log('   ... Downloaded successfully');
                fs.writeFileSync(localFileName, Buffer.concat(data));
                resolve();
              });
            });
            request.on('error', function (e) {
              console.log(e.message);
              reject();
            });
            request.end();
          });
        }

        /**
         * END - Recognize Printed & Handwritten Text
         */
        console.log("Printed Result:", printedResult)
        res.render("result.ejs", { result: printedResult, img: bookURL });
      }
    ])

  } catch (err) {
    console.log(err);
  }
});

app.listen(process.env.PORT || 8000);