# SFCC-Archive import
It is used to zip the folder and import it as site import in the targeted instance, it uses most of the configuration from dw.json

## Features
- Automatically archives the folder in temp path
- Upload the zip file in targeted realm 
- Import as site import
- Fetch the hostname, username, password from dw.json
- Can configure other credentials required in dw.json itself instead of passing as param such as folderToImport, clientId, clientPassword

## Getting started
```
npm install sfcc-archive-import -g
```

## Usage
sfcc-archive-import [options]

Sample command when installed globally
```
sfcc-archive-import --folderToImport=<relative path of folder> --clientId=<clientId> --clientPassword=<clientPassword>
```
May skip clientId and clientPassword when they are default aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

