# Whaler hosts plugin

## Install

```sh
$ whaler plugins:install whaler-hosts-plugin
```

> **NB!** After plugin install, you need start at least one service, to enable plugin.

## Get IP

```sh
$ docker inspect whaler_hosts --format '{{.NetworkSettings.Networks.whaler_hosts_nw.IPAddress}}'
```

## Dnsmasq

> **NB!** Dnsmasq step is pure optional, but then you need manually add records to `/etc/hosts` file.

Install dnsmasq:

```sh
$ sudo apt-get install dnsmasq
```

Update config file `/etc/dnsmasq.conf` with following line:

> **NB!** If you have `address=/whaler.lh/[IP], remove it.`

```
server=/whaler.lh/[IP]
```

> **NB!** Don't forget to replace [IP] with `whaler_hosts` container IP.

## License

This software is under the MIT license. See the complete license in:

```
LICENSE
```
