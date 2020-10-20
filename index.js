'use strict';

const fs = require('fs');
const util = require('util');
const mkdirp = require('mkdirp');
const fsWriteFile = util.promisify(fs.writeFile);

module.exports = exports;

/**
 * @param whaler
 */
async function exports (whaler) {

    whaler.after('start', async ctx => {
        await touchHosts();
    });

    whaler.after('stop', async ctx => {
        await touchHosts();
    });

    whaler.after('remove', async ctx => {
        await touchHosts();
    });

    // PRIVATE

    const touchHosts = async () => {
        const { default: docker } = await whaler.fetch('docker');
        const { default: storage } = await whaler.fetch('apps');
        const apps = await storage.all();

        const hosts = [];
        const domain = process.env.WHALER_HOSTS_PLUGIN_DOMAIN || 'whaler.lh';

        for (let appName in apps) {
            const containers = await docker.listContainers({
                all: true,
                filters: JSON.stringify({
                    name: [
                        docker.util.nameFilter(appName)
                    ]
                })
            });

            for (let info of containers) {
                if ('running' == info['State']) {
                    const parts = info['Names'][0].substr(1).split('.');
                    hosts.push({
                        ip: info['NetworkSettings']['Networks']['bridge']['IPAddress'],
                        domain: parts[0] + '.' + appName + '.' + domain
                    });
                }
            }
        }

        await mkdirp('/var/lib/whaler/plugins/dnsmasq');

        let res = [];
        for (let data of hosts) {
            res.push(data['ip'] + '\t' + data['domain']);
        }
        res.push('');
        await fsWriteFile('/var/lib/whaler/plugins/dnsmasq/hosts', res.join('\n'));

        let dockerBridgeNetwork = docker.getNetwork('bridge');
        const bridgeInfo = await dockerBridgeNetwork.inspect();

        let conf = [
            'no-resolv',
            'no-hosts',
            'addn-hosts=/etc/dnsmasq.hosts',
            'address=/' + domain + '/' + bridgeInfo['IPAM']['Config'][0]['Gateway'],
            ''
        ];
        await fsWriteFile('/var/lib/whaler/plugins/dnsmasq/conf', conf.join('\n'));

        let created = false;
        let started = false;

        let container = docker.getContainer('whaler_hosts');
        try {
            const info = await container.inspect();
            created = true;
            if (info['State']['Running']) {
                started = true;
            }
        } catch (e) {}

        if (!created) {
            try {
                await docker.followPull('andyshinn/dnsmasq:2.76');
            } catch(e) {}

            let whalerHostsNetwork = null;
            try {
                whalerHostsNetwork = await docker.createNetwork({
                    'Name': 'whaler_hosts_nw',
                    'CheckDuplicate': true
                });
            } catch (e) {
                whalerHostsNetwork = docker.getNetwork('whaler_hosts_nw');
            }

            const createOpts = {
                'name': 'whaler_hosts',
                'Image': 'andyshinn/dnsmasq:2.76',
                'Entrypoint': [],
                'Cmd': ['dnsmasq', '--no-daemon'],
                'HostConfig': {
                    'Binds': [
                        '/var/lib/whaler/plugins/dnsmasq/hosts:/etc/dnsmasq.hosts',
                        '/var/lib/whaler/plugins/dnsmasq/conf:/etc/dnsmasq.conf'
                    ],
                    'RestartPolicy': {
                        'Name': 'always'
                    }
                }
            };

            container = await docker.createContainer(createOpts);

            if (whalerHostsNetwork) {
                const nwInfo = await whalerHostsNetwork.inspect();

                await whalerHostsNetwork.connect({
                    'Container': container.id
                });
            }
        }

        if (started) {
            //await container.restart();
            await container.kill({ signal: 'HUP' });

        } else {
            await container.start();
        }

        const info = await container.inspect();
        if (info['State']['Running']) {
            const ip = info['NetworkSettings']['Networks']['whaler_hosts_nw']['IPAddress'];
            whaler.info('Hosts server %s. IP:', started ? 'restarted' : 'started', ip);
        }
    };

}
