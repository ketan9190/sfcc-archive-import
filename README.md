# SFCC-Archive import
It is used to zip the folder and import it as site import in the targeted instance, it uses most of the configuration from dw.json

## Features
- Automatically archives the folder in temp path
- Upload the zip file in targeted realm 
- Import as site import
- Fetch the hostname, username, password from dw.json
- Can configure other credentials required in dw.json itself instead of passing as param such as folderToImport, clientId, clientPassword
- Provides log file path and Import Results (SUMMARY). 

## Prerequisites

#### Minimum Node Version Required : 18.15.0
#### OCAPI settings in BM:
- Go to Administration > Site Development > Open Commerce API Settings
- Select Type : Data
- Select Context : Global
- Settings for default client id (Change the client id if required)
```
{
	"_v":"21.3",
	"clients":[
		{
			"client_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"resources":[
				{
					"resource_id": "/**",
					"methods": [
						"get",
						"put",
						"patch",
						"delete",
						"post"
					],
					"read_attributes": "(**)",
					"write_attributes": "(**)",
					"cache_time": 0
				}
			]
		}
	]
}
```
## Getting started
```
npm install sfcc-archive-import -g
```

## Usage
sfcc-archive-import [options]

Sample command when installed globally
```
If hostname, username, password is defined in dw.json
sfcc-archive-import --folderToImport=<relative path of folder> --clientId=<clientId> --clientPassword=<clientPassword>
```
May skip clientId and clientPassword when they are default aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

## Options
<pre>
  --help                         Generate help message
  -h, --hostname String          Hostname of the server to be connected
  -u, --username String          BM username
  -p, --password String          BM password
  -c, --clientId String          OCAPI client ID
  -l, --clientPassword String    OCAPI client password
  --folderToImport, --fi String  Path of folder to be imported
  --doNotZip, --dnz              Used when zip file is provided in folderToImport path, zipping the folder    
                                 is not required
</pre>
Default clientId and clientPassword (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) will be used if it is not provided.