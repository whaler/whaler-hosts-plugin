'use strict';

var fs = require('fs');
var mkdirp = require('mkdirp');
var console = require('x-console');

module.exports = exports;

/**
 * @param whaler
 */
function exports(whaler) {

    whaler.after('start', function* (options) {
        yield touchHosts.$call(null, whaler);
    });

    whaler.after('stop', function* (options) {
        yield touchHosts.$call(null, whaler);
    });

    whaler.after('remove', function* (options) {
        yield touchHosts.$call(null, whaler);
    });

}

// PRIVATE

/**
 * @param ip
 * @returns {string}
 */
function getNextIPV4Address(ip) {
    const arr = ip.split('.');
    arr[3] = parseInt(arr[3]) + 1;

    return arr.join('.');
}

/**
 * @param whaler
 */
function* touchHosts(whaler) {
    const docker = whaler.get('docker');
    const storage = whaler.get('apps');
    const apps = yield storage.all.$call(storage);

    const hosts = [];
    const domain = process.env.WHALER_HOSTS_PLUGIN_DOMAIN || 'whaler.lh';

    for (let appName in apps) {
        const containers = yield docker.listContainers.$call(docker, {
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

    yield mkdirp.$call(null, '/var/lib/whaler/plugins/dnsmasq');

    let res = [];
    for (let data of hosts) {
        res.push(data['ip'] + '\t' + data['domain']);
    }
    res.push('');
    yield fs.writeFile.$call(null, '/var/lib/whaler/plugins/dnsmasq/hosts', res.join('\n'));

    let dockerBridgeNetwork = docker.getNetwork('bridge');
    const bridgeInfo = yield dockerBridgeNetwork.inspect.$call(dockerBridgeNetwork);

    let conf = [
        'no-resolv',
        'no-hosts',
        'addn-hosts=/etc/dnsmasq.hosts',
        'address=/' + domain + '/' + bridgeInfo['IPAM']['Config'][0]['Gateway'],
        ''
    ];
    yield fs.writeFile.$call(null, '/var/lib/whaler/plugins/dnsmasq/conf', conf.join('\n'));

    let created = false;
    let started = false;

    let container = docker.getContainer('whaler_hosts');
    try {
        const info = yield container.inspect.$call(container);
        created = true;
        if (info['State']['Running']) {
            started = true;
        }
    } catch (e) {}

    if (!created) {
        try {
            yield docker.followPull.$call(docker, 'andyshinn/dnsmasq:2.76');
        } catch(e) {}

        let whalerHostsNetwork = null;
        try {
            whalerHostsNetwork = yield docker.createNetwork.$call(docker, {
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

        container = yield docker.createContainer.$call(docker, createOpts);

        if (whalerHostsNetwork) {
            const nwInfo = yield whalerHostsNetwork.inspect.$call(whalerHostsNetwork);

            yield whalerHostsNetwork.connect.$call(whalerHostsNetwork, {
                'Container': container.id,
                'EndpointConfig': {
                    'IPAMConfig': {
                        'IPv4Address': getNextIPV4Address(nwInfo['IPAM']['Config'][0]['Gateway'])
                    }
                }
            });
        }
    }

    if (started) {
        yield container.restart.$call(container);

    } else {
        yield container.start.$call(container);
    }

    const info = yield container.inspect.$call(container);
    if (info['State']['Running']) {
        const ip = info['NetworkSettings']['Networks']['whaler_hosts_nw']['IPAddress'];
        console.info('');
        console.info('[%s] Hosts server %s. IP:', process.pid, started ? 'restarted' : 'started', ip);
    }
}
