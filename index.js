var fs = require('fs');
var mqtt = require('mqtt');
var redis = require("redis");
var aws = require('aws-sdk');
var propertiesReader = require('properties-reader');
var properties = propertiesReader('properties.file');

var redisClient = redis.createClient();

// properties
var AWS_ACCESS_KEY_ID = properties.get('aws.access.key.production');
var AWS_SECRET_ACCESS_KEY = properties.get('aws.secret.key.production');
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

var client  = mqtt.connect('mqtt://' + MQTT_HOST + ':' + MQTT_PORT, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD
});

client.on('connect', function () {
	client.subscribe(MQTT_TOPIC);
});

client.on('message', function (topic, message) {
	if (message.toString() === "CONNECTED") {
		logDebug("Connecting user with id: " + topic.split("/")[3])
		redisClient.set(topic.split("/")[3] + "/ONLINE", true);
		redisClient.expire(topic.split("/")[3] + "/ONLINE", 36000); // 10 hours expiration
	} else if (message.toString() === "DISCONNECTED") {
		logDebug("Disconnecting user with id: " + topic.split("/")[3])
		redisClient.del(topic.split("/")[3] + "/ONLINE");
		redisClient.set(topic.split("/")[3] + "/LAST_SEEN", new Date().getTime());
	}
});

var interval = setInterval(function() {
	uploadLogs();
}, 3600000);