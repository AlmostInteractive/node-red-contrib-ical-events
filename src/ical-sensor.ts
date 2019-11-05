
import { Red, Node } from 'node-red';
import * as crypto from "crypto-js";
import { CronJob } from 'cron';
import * as parser from 'cron-parser';
import { Config } from './ical-config';
import { CalEvent } from './ical-events';
import { getICal } from './helper';

module.exports = function (RED: Red) {
    function sensorNode(config: any) {
        RED.nodes.createNode(this, config);
        let configNode = RED.nodes.getNode(config.confignode) as unknown as Config;
        let node = this;
        this.config = configNode;

        try {
            node.on('input', () => {
                cronCheckJob(this, config);
            });

            if (config.cron && config.cron !== "") {
                parser.parseExpression(config.cron);

                node.job = new CronJob(config.cron || '0 0 * * * *', cronCheckJob.bind(null, node, config));
                node.job.start();

                node.on('close', () => {
                    node.job.stop();
                });
            }
        }
        catch (err) {
            node.error('Error: ' + err.message);
            node.status({ fill: "red", shape: "ring", text: err.message })
        }
    }

    function cronCheckJob(node: any, config: any) {
        if (node.job && node.job.running) {
            node.status({ fill: "green", shape: "dot", text: node.job.nextDate().toISOString() });
        }
        else {
            node.status({});
        }

        var dateNow = new Date();
        getICal(node, node.config.url, node.config, (err, data) => {
            if (err || !data) {
                return;
            }

            node.debug('Ical read successfully ' + config.url);
            if (data) {
                let current = false;
                for (let k in data) {
                    if (data.hasOwnProperty(k)) {
                        var ev = data[k];

                        const eventStart = new Date(ev.start);
                        const eventEnd = new Date(ev.end);
                        if (ev.type == 'VEVENT') {                           
                            if (eventStart <= dateNow && dateNow <= eventEnd) {
                                let uid = crypto.MD5(ev.created + ev.summary).toString();
                                if (ev.uid) {
                                    uid = ev.uid;
                                }

                                const event: CalEvent = {
                                    summary: ev.summary,
                                    id: uid,
                                    location: ev.location,
                                    eventStart: new Date(ev.start),
                                    eventEnd: new Date(ev.end),
                                    description: ev.description,
                                    on: true,
                                    off:false
                                }

                                node.send(event);
                                current = true;
                            }
                        }
                    }
                }

                if (!current) {
                    const event = {
                        on: false,
                        off:true
                    }

                    node.send(event);
                }
            }
        });
    }

    RED.nodes.registerType("ical-sensor", sensorNode);
}