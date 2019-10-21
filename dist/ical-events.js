"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var crypto = require("crypto-js");
var ical = require("node-ical");
var cron_1 = require("cron");
var caldav_1 = require("./caldav");
var parser = require("cron-parser");
module.exports = function (RED) {
    var newCronJobs = new Map();
    function eventsNode(config) {
        var _this = this;
        RED.nodes.createNode(this, config);
        var configNode = RED.nodes.getNode(config.confignode);
        this.config = configNode;
        try {
            this.on('input', function () {
                cronCheckJob(_this, config);
            });
            this.on('close', function () {
                _this.context().get('startedCronJobs').forEach(function (job_started, key) {
                    job_started.stop();
                    _this.debug(job_started.uid + " stopped");
                });
                _this.context().get('startedCronJobs').clear();
                _this.debug("cron stopped");
            });
            if (config.cron && config.cron !== "") {
                parser.parseExpression(config.cron);
                this.job = new cron_1.CronJob(config.cron || '0 0 * * * *', cronCheckJob.bind(null, this, config));
                this.job.start();
                this.on('close', function () {
                    _this.job.stop();
                });
            }
        }
        catch (err) {
            this.error('Error: ' + err.message);
            this.status({ fill: "red", shape: "ring", text: err.message });
        }
    }
    function getICal(node, urlOrFile, config, callback) {
        if (urlOrFile.match(/^https?:\/\//)) {
            if (node.config.caldav && JSON.parse(node.config.caldav) === true) {
                caldav_1.CalDav(node, node.config, null, function (data) {
                    callback(null, data);
                });
            }
            else {
                var header = {};
                var username = node.config.username;
                var password = node.config.password;
                if (username && password) {
                    var auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
                    header = {
                        headers: {
                            'Authorization': auth
                        }
                    };
                }
                ical.fromURL(node.config.url, header, function (err, data) {
                    if (err) {
                        callback && callback(err, null);
                        return;
                    }
                    callback && callback(null, data);
                });
            }
        }
    }
    function cronCheckJob(node, config) {
        if (node.job && node.job.running) {
            node.status({ fill: "green", shape: "dot", text: node.job.nextDate().toISOString() });
        }
        else {
            node.status({});
        }
        var dateNow = new Date();
        getICal(node, node.config.url, node.config, function (err, data) {
            if (err || !data) {
                return;
            }
            node.debug('Ical read successfully ' + config.url);
            if (data) {
                for (var k in data) {
                    if (data.hasOwnProperty(k)) {
                        var ev = data[k];
                        var eventStart = new Date(ev.start);
                        if (ev.type == 'VEVENT') {
                            if (eventStart > dateNow) {
                                var uid = crypto.MD5(ev.start + ev.summary).toString();
                                if (ev.uid) {
                                    uid = ev.uid;
                                }
                                var event_1 = {
                                    summary: ev.summary,
                                    id: uid,
                                    location: ev.location,
                                    eventStart: new Date(ev.start),
                                    eventEnd: new Date(ev.end),
                                    description: ev.description
                                };
                                if (config.offset) {
                                    eventStart.setMinutes(eventStart.getMinutes() + parseInt(config.offset));
                                }
                                else {
                                    eventStart.setMinutes(eventStart.getMinutes() - 1);
                                }
                                var job2 = new cron_1.CronJob(eventStart, cronJob.bind(null, event_1, node));
                                var startedCronJobs = node.context().get('startedCronJobs') || {};
                                if (!newCronJobs.has(uid) && !startedCronJobs[uid]) {
                                    newCronJobs.set(uid, job2);
                                    node.debug("new - " + uid);
                                }
                                else if (startedCronJobs[uid]) {
                                    node.debug("started - " + uid);
                                }
                            }
                        }
                    }
                }
                newCronJobs.forEach(function (job, key) {
                    try {
                        job.start();
                        node.debug("starting - " + key);
                        var startedCronJobs = node.context().get('startedCronJobs') || {};
                        startedCronJobs[key] = job;
                        node.context().set('startedCronJobs', startedCronJobs);
                    }
                    catch (newCronErr) {
                        node.error(newCronErr);
                    }
                });
                newCronJobs.clear();
            }
        });
    }
    function cronJob(event, node) {
        node.send({
            payload: event
        });
    }
    RED.nodes.registerType("ical-events", eventsNode);
};
