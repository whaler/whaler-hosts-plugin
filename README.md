# Whaler hosts plugin

This plugin adds the ability to call app services by domain name `[service].[app].whaler.lh`

## Install

```sh
whaler plugins:install whaler-hosts-plugin
```

> **NB!** After installing the plugin, you need start at least one service, to enable it.

## Get IP

```sh
docker inspect whaler_hosts --format '{{.NetworkSettings.Networks.whaler_hosts_nw.IPAddress}}'
```

## Configure `systemd-resolved` to use custom DNS nameserver

> **NB!** Don't forget to replace `<IP>` with `whaler_hosts` container IP.

Create `systemd-resolved` config file:

```conf
# /etc/systemd/resolved.conf.d/whaler-hosts.conf
[Resolve]
DNS=<IP>
Domains=~whaler.lh
```

Restart `systemd-resolved`:

```sh
sudo systemctl restart systemd-resolved
```

## Configure `docker daemon` to use custom DNS nameserver

Update `docker daemon` config file:

```json
# /etc/docker/daemon.json
{
    "dns": ["8.8.8.8"]
}
```

Restart `docker`:

```sh
sudo systemctl restart docker
```

## License

This software is under the MIT license. See the complete license in:

```
LICENSE
```
