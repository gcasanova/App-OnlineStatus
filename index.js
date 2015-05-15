var fs = require('fs');
var mqtt = require('mqtt');
var aws = require('aws-sdk');
var propertiesReader = require('properties-reader');
var properties = propertiesReader('properties.file');

var dynamodb = new aws.DynamoDB();

// properties
var AWS_ACCESS_KEY_ID = properties.get('aws.access.key.production');
var AWS_SECRET_ACCESS_KEY = properties.get('aws.secret.key.production');
var AWS_DYNAMODB_TABLE = properties.get('aws.dynamodb.table');
var AWS_BUCKET_NAME_LOGS = properties.get('aws.s3.bucket.name.logs');
var MQTT_HOST = properties.get('mqtt.host');
var MQTT_PORT = properties.get('mqtt.port');
var MQTT_USERNAME = properties.get('mqtt.username');
var MQTT_PASSWORD = properties.get('mqtt.password');
var MQTT_TOPIC = properties.get('mqtt.topic');

// set AWS configuration for future requests
aws.config.update({"accessKeyId": AWS_ACCESS_KEY_ID, "secretAccessKey": AWS_SECRET_ACCESS_KEY, "region": "eu-west-1"});
aws.config.apiVersions = {
  dynamodb: '2012-08-10'
};

// functions
function logDebug(message) {
	fs.appendFile('./logs/debug.txt', new Date().getTime() + ": " + message + "\n", function (err) {
		if (err) {
			throw err;
		}
	});
}

function logError(message) {
	fs.appendFile('./logs/errors.txt', new Date().getTime() + ": " + message + "\n", function (err) {
		if (err) {
			throw err;
		}
	});
}

function uploadLogs() {
	fs.exists('./logs/debug.txt', function (exists) {
		if (exists) {
			var today = new Date();
			var body = fs.readFileSync('./logs/debug.txt');
			var key = today.getUTCDate() + "-" + (today.getUTCMonth() + 1) + "-" + today.getUTCFullYear() + "_" + (("0" + today.getUTCHours()).slice(-2)) + ":" + (("0" + today.getUTCMinutes()).slice(-2)) + "_debug.txt";
			var s3 = new aws.S3({
				params : {
					Bucket : AWS_BUCKET_NAME_LOGS,
					Key : key
				}
			});
			
			s3.upload({Body : body}, function(err, data) {
				if (!err) {
					fs.unlinkSync('./logs/debug.txt');
				} else {
					logError("UPLOAD DEBUG LOGS TO S3 ERROR: " + err);
				}
			});
		}
	});
	
	
	fs.exists('./logs/errors.txt', function (exists) {
		if (exists) {
			var today = new Date();
			var body = fs.readFileSync('./logs/errors.txt');
			var key = today.getUTCDate() + "-" + (today.getUTCMonth() + 1) + "-" + today.getUTCFullYear() + "_" + (("0" + today.getUTCHours()).slice(-2)) + ":" + (("0" + today.getUTCMinutes()).slice(-2)) + "_errors.txt";
			var s3 = new aws.S3({
				params : {
					Bucket : AWS_BUCKET_NAME_LOGS,
					Key : key
				}
			});
			
			s3.upload({Body : body}, function(err, data) {
				if (!err) {
					fs.unlinkSync('./logs/errors.txt');
				} else {
					logError("UPLOAD ERRORS LOGS TO S3 ERROR: " + err);
				}
			});
		}
	});
}

var client  = mqtt.connect('mqtt://' + MQTT_HOST + ':' + MQTT_PORT);
client.on('connect', function () {
	client.subscribe(MQTT_TOPIC);
});

client.on('message', function (topic, message) {
	if (message.toString() === "CONNECTED") {
		updateApi(topic.split("/")[2], 1);
	} else if (message.toString() === "DISCONNECTED") {
		updateApi(topic.split("/")[2], 0);
	}
});

// update item api's
var updateApi = limit(function(id, isOnline) {
	dynamodb.updateItem({
    	"Key": {
	    	"Id": id
    	},
		TableName: AWS_DYNAMODB_TABLE,
	    "UpdateExpression": "SET IsOnline = :a",
	    "ExpressionAttributeValues" : {
	    	":a" : {"N":isOnline}
	    }
	}, function(err, data) {
	  	if (err) {
				logError("Update item to dynamodb failed: " + err);
			}
	});
}).to(5).per(1000);