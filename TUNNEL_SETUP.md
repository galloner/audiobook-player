# Cloudflare Tunnel 搭建指南

## 背景

云盘（OpenList/AList）默认只监听 HTTP（`http://3.145.85.4:5244`）。
当播放器部署在 HTTPS 域名（`https://audiobook.6068909.xyz`）上时，
浏览器会拦截 HTTPS 页面里的 HTTP 资源（混合内容），导致音频加载失败。

Cloudflare Tunnel 可以给云盘套一层 HTTPS，同时 Cloudflare 边缘会自动补上
`Access-Control-Allow-Origin: *`，解决 CORS 问题。

## 效果

```
浏览器 (HTTPS)
  │
  ├─ 播放器页面  https://audiobook.6068909.xyz        ← Workers 静态托管
  │
  └─ 音频/字幕    https://cloud.6068909.xyz/d/...      ← Tunnel → 云盘
                    │
                    └─ Cloudflare 边缘 (HTTPS + CORS)
                        │
                        └─ cloudflared 隧道
                            │
                            └─ http://localhost:5244  ← OpenList 本地
```

## 搭建步骤

### 1. 在云盘服务器上安装 cloudflared

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# 或直接下载二进制
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
```

> Windows: 下载 `cloudflared-windows-amd64.exe`，重命名为 `cloudflared.exe`，
> 放到 PATH 目录或当前目录。

### 2. 登录 Cloudflare

```bash
cloudflared tunnel login
```

浏览器会打开授权页面，选择你的域名 `6068909.xyz` 授权。
授权后会在 `~/.cloudflared/` 生成 `cert.pem`。

### 3. 创建隧道

```bash
cloudflared tunnel create cloud-drive
```

输出类似：
```
Created tunnel cloud-drive with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

记下这个 ID，会自动写入配置文件。

### 4. 配置隧道

创建 `~/.cloudflared/config.yml`：

```yaml
tunnel: <上一步的隧道 ID>
credentials-file: /root/.cloudflared/<隧道 ID>.json

ingress:
  # cloud.6068909.xyz → OpenList 本地服务
  - hostname: cloud.6068909.xyz
    service: http://localhost:5244

  # 兜底：未匹配的请求返回 404
  - service: http_status:404
```

> 如果 OpenList 跑在别的端口或别的机器，改成对应的 `http://IP:PORT`。

### 5. 添加 DNS 记录

```bash
cloudflared tunnel route dns cloud-drive cloud.6068909.xyz
```

这会自动在 Cloudflare DNS 里添加一条 CNAME 指向隧道。
不用手动管证书，Cloudflare 自动处理。

### 6. 启动隧道

```bash
# 前台测试
cloudflared tunnel run cloud-drive

# 确认无误后，安装为系统服务（开机自启）
sudo cloudflared service install
```

### 7. 验证

```bash
# 应返回 206
curl -I -H "Range: bytes=0-0" https://cloud.6068909.xyz/d/星河云盘/resource/TTS/book-read/打卡，人在洪荒，刚捏爆三足金乌\ by\ 何为孤独/mp3/001_第一章，无耻的准提圣人.mp3

# 检查 CORS 头
curl -I -H "Origin: https://audiobook.6068909.xyz" https://cloud.6068909.xyz/d/星河云盘/resource/TTS/book-read/打卡，人在洪荒，刚捏爆三足金乌\ by\ 何为孤独/sub/001_第一章，无耻的准提圣人.json
# 应看到 Access-Control-Allow-Origin: *
```

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `cloud.6068909.xyz` 打不开 | 隧道未启动 | `cloudflared tunnel run cloud-drive` |
| 502 Bad Gateway | OpenList 没在 localhost:5244 跑 | 检查 `config.yml` 的 service 地址 |
| 音频能播但字幕加载失败 | Cloudflare 没补 CORS | 在 Cloudflare Dashboard → 域名 → Rules → Transform Rules 加 CORS |
| 隧道频繁断开 | OpenList 重启 | 确保 OpenList 以 systemd 服务运行 |

## 替代方案

如果不想用 Tunnel，也可以：

1. **Nginx + Let's Encrypt 反代**：在云盘服务器上配 Nginx，用 `certbot` 申请证书，
   反代到 localhost:5244，手动加 CORS 头。
2. **音频搬到 Cloudflare R2**：R2 原生支持 HTTPS + CORS，免费 10GB。
