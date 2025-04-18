#!/usr/bin/env node

import axios from "axios";
import qs from "qs";
import fs from "fs";
import http from "https";
import { zip } from "zip-a-folder";
import path from "path";

import sfccci from "sfcc-ci";
import chalk from "chalk";
import cliSpinners from "cli-spinners";

import ora from "ora";

import optionator from "optionator";

const spinner = new ora({ spinner: cliSpinners.simpleDotsScrolling });
const interval = 5 * 1000;

let optionatorLocal = optionator({
  options: [
    {
      option: "help",
      type: "Boolean",
      description: "Generate help message",
    },
    {
      option: "hostname",
      alias: "h",
      type: "String",
      description: "Hostname of the server to be connected",
    },
    {
      option: "username",
      alias: "u",
      type: "String",
      description: "BM username",
    },
    {
      option: "password",
      alias: "p",
      type: "String",
      description: "BM password",
    },
    {
      option: "clientId",
      alias: "c",
      type: "String",
      description: "OCAPI client ID",
    },
    {
      option: "clientPassword",
      alias: "l",
      type: "String",
      description: "OCAPI client password",
    },
    {
      option: "folderToImport",
      alias: "fi",
      type: "String",
      description: "Path of folder to be imported relative to current working directory",
    },
    {
      option: "doNotZip",
      alias: "dnz",
      type: "Boolean",
      description: "Used when zip file is provided in folderToImport path, zipping the folder is not required",
    },
  ],
});

let config = {};
const options = optionatorLocal.parse(process.argv);

if (options.help) {
  console.log(optionatorLocal.generateHelp());
  process.exit(0);
}

let pathsForDw = ["dw.json", "cartridges/dw.json"];

pathsForDw.forEach((pathFordw) => {
  if (fs.existsSync(path.resolve(pathFordw))) {
    let configlocal = JSON.parse(fs.readFileSync(path.resolve(pathFordw), "utf8"));
    let { hostname, username, password, folderToImport, clientId, clientPassword } = configlocal;
    config = { hostname, username, password, folderToImport, clientId, clientPassword };
  }
});

let applicableAttr = ["hostname", "username", "password", "folderToImport", "clientId", "clientPassword"];

applicableAttr.forEach((attr) => {
  if (options[attr]) {
    config[attr] = options[attr];
  }
});

if (!config.clientId) config.clientId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
if (!config.clientPassword) config.clientPassword = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

let maskedconfigCopy = JSON.parse(JSON.stringify(config));
maskedconfigCopy.password = "******";
console.log(`Credentials being used : ${JSON.stringify(maskedconfigCopy, null, 2)}`);

function auth() {
  let authApi = sfccci.auth;

  return new Promise(async (resolve, reject) => {
    authApi.auth(config.clientId, config.clientPassword, function (err, token) {
      if (!token) {
        spinner.fail(chalk.red("Authorization failed"));
        reject();
        process.exit(0);
      }

      resolve(token);
    });
  });
}

let startImport = function startImport(token, fileName, ocapiHost) {
  let instanceApi = sfccci.instance;

  return new Promise(async (resolve, reject) => {
    instanceApi.import(ocapiHost, fileName, token, function (error, result) {
      // console.log(`*****Starting Import for host : ` + ocapiHost);
      let jobId;
      let jobExecutionId;
      let errorMessage;
      if (!error && typeof result !== "undefined" && result.id) {
        jobId = result.job_id;
        jobExecutionId = result.id;
      } else if (typeof result !== "undefined" && result.fault) {
        errorMessage = "Could not start import job! HTTP " + error.status + ": " + result.fault.message;
      } else {
        errorMessage = "Could not start import job! " + error;
      }

      if (errorMessage) {
        spinner.fail(chalk.red(`${errorMessage}, Please check credentials and OCAPI permissions`));
        reject();
        process.exit(0);
      }

      resolve({
        jobId: jobId,
        jobExecutionId: jobExecutionId,
      });
    });
  });
};

async function checkJobStatus(ocapiHost, token, jobId, jobExecutionId) {
  const checkStatus = async () => {
    try {
      // API call to check job status
      const response = await checkOCAPIJobStatus(ocapiHost, token, jobId, jobExecutionId);

      const status = response.data.execution_status; // Assuming the response has 'status'
      if (status === "finished") {
        let exit_status = response.data?.exit_status?.status;
        let logfilePath = response.data?.log_file_path;
        let logFileFullURL = logfilePath ? `https://${ocapiHost}/on/demandware.servlet/webdav${logfilePath}` : "";

        let status = {
          logFile: logFileFullURL,
        };

        if (exit_status === "ok") {
          spinner.succeed(chalk.green(`Zip imported ${JSON.stringify(status, null, 2)}`));
        } else if (exit_status === "error") {
          status.steps = [];

          response.data.step_executions.forEach((step) => {
            status.steps.push({
              step_id: step.step_id,
              status: step.status,
              errorMessage: step.exit_status?.message,
            });
          });

          spinner.fail(chalk.red(`Error in JOB, below are the details ${JSON.stringify(status, null, 2)}`));
        }

        // fetch Import summary from Logs
        let configJOBExecution = {
          method: "get",
          maxBodyLength: Infinity,
          url: logFileFullURL,
          auth: {
            username: config.username,
            password: config.password,
          },
        };

        let responseJobExecution = await axios.request(configJOBExecution);
        const log = responseJobExecution.data;
        const match = log.match(/============ Import Results \(SUMMARY\)[\s\S]*?(?=\n\[\d{4}-\d{2}-\d{2}.* GMT\])/);

        const summary = match ? match[0] : "";
        spinner.info(chalk.yellow(`${summary} For detailed logs, refer the log file path given above.`));
        clearInterval(statusInterval); // Clear the status check interval
        process.exit(0);
      } else {
        spinner.start(chalk.yellow("Import Job still running..."));
      }
    } catch (error) {
      console.error(`Error checking status for ${jobId}:`, error);
      process.exit(0);
    }
  };

  // Check status immediately, then every 5 sec
  const statusInterval = setInterval(checkStatus, interval);

  // Check status once immediately
  checkStatus();
}

async function checkOCAPIJobStatus(ocapiHost, token, jobIdToExecute, jobID) {
  try {
    let configJOBExecution = {
      method: "get",
      maxBodyLength: Infinity,
      url: `https://${ocapiHost}/s/-/dw/data/v22_6/jobs/${jobIdToExecute}/executions/${jobID}`,
      headers: {
        "x-dw-client-id": config.clientId,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    let responseJobExecution = await axios.request(configJOBExecution);
    return responseJobExecution;
  } catch (e) {
    console.log("error while job status execution", e.response.data);
  }
}

// fs.rm(path.resolve(archiveOutputPath,`${folderName}`), { recursive: true, force: true },()=>{})

async function uploadArchive(hostname, username, password, zipFilePathToUpload) {
  return new Promise(async (resolve, reject) => {
    let zipFileNameToUpload = path.basename(zipFilePathToUpload);

    var httpOptions = {
      hostname: hostname,
      port: 443,
      path: "/on/demandware.servlet/webdav/Sites/Impex/src/instance/",
      auth: `${username}:${password}`,
    };
    var data = fs.readFileSync(zipFilePathToUpload);

    httpOptions.method = "POST";
    httpOptions.path += zipFileNameToUpload;

    var putRequest = http.request(httpOptions, function (res) {
      var success = false;

      if (res.statusCode === 201 || res.statusCode === 200) {
        // console.log("uploaded");
        success = true;
      } else if (res.statusCode === 204) {
        success = true;
        // console.log("Remote file exists!");
      } else if (res.statusCode === 401) {
        console.log("Authentication failed. Please check credentials.");

        return;
      } else if (res.statusCode === 405) {
        console.log("Remote server does not support webdav!");
      } else {
        console.log("Unknown error occurred: " + res.statusCode + " (" + res.statusMessage + ")!");
      }

      if (success) {
        resolve(zipFileNameToUpload);
      } else {
        reject(new Error("Error in uploading the file"));
      }
    });

    putRequest.on("error", function (e) {
      reject(new Error("Error  " + e.message));
    });

    putRequest.end(data, "binary");
  });
}

async function zipTheFolder(folderPathToUpload) {
  return new Promise(async (resolve, reject) => {
    let pathToUpload = folderPathToUpload;
    let parentFolder = path.dirname(pathToUpload);
    let folderName = path.basename(pathToUpload);
    let archiveOutputPath = path.resolve(parentFolder, `temp_${folderName}`);

    fs.cpSync(pathToUpload, path.resolve(archiveOutputPath, `${folderName}/${folderName}`), { recursive: true });
    await zip(path.resolve(archiveOutputPath, `${folderName}`), path.resolve(archiveOutputPath, `${folderName}.zip`));

    let zipFilePathToUpload = path.resolve(archiveOutputPath, `${folderName}.zip`);

    resolve({
      zipFilePathToUpload: zipFilePathToUpload,
      archiveOutputPath: archiveOutputPath,
    });
  });
}

async function uploadAndImportArchive(ocapiHost, username, password, pathToUpload) {
  try {
    let zipFilePathToUpload, archiveOutputPath;

    let zipFilePath = path.resolve(pathToUpload);
    if (!options.doNotZip) {
      // zip the folder
      spinner.start(chalk.yellow("Zipping folder at temp path..."));
      ({ zipFilePathToUpload, archiveOutputPath } = await zipTheFolder(zipFilePath));
      spinner.succeed(chalk.green("Folder zipped at temp path: " + zipFilePathToUpload));

      zipFilePath = zipFilePathToUpload;
    }

    //upload zipped file
    spinner.start(chalk.yellow("Uploading zip file..."));
    let filename = await uploadArchive(ocapiHost, username, password, zipFilePath);
    spinner.succeed(chalk.green("File uploaded : " + filename));

    if (!options.doNotZip) {
      // delete temp path where folder was zipped
      fs.rmSync(archiveOutputPath, { recursive: true, force: true });
      spinner.succeed(chalk.green("Deleted temp path : " + archiveOutputPath));
    }

    spinner.start(chalk.yellow("Importing zip..."));

    let token = await auth();
    let jobContext = await startImport(token, filename, ocapiHost);

    checkJobStatus(ocapiHost, token, jobContext.jobId, jobContext.jobExecutionId);
  } catch (e) {
    spinner.fail(chalk.red("Error Occured : " + e.message));
    process.exit(0);
  }
}

uploadAndImportArchive(config.hostname, config.username, config.password, config.folderToImport);
