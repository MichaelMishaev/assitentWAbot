# Nginx Configuration for ailo.digital

## Production Server Configuration

**Location**: `/etc/nginx/sites-available/ailo.digital`

**Symlink**: `/etc/nginx/sites-enabled/ailo.digital`

### Current Configuration

```nginx
server {
    server_name ailo.digital www.ailo.digital;

    location / {
        proxy_pass http://localhost:7100;  # Express server port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/ailo.digital/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/ailo.digital/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.ailo.digital) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = ailo.digital) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    listen [::]:80;
    server_name ailo.digital www.ailo.digital;
    return 404; # managed by Certbot
}
```

## Important Notes

### Port Configuration

The Express server listens on **port 7100** as defined in `.env`:
```bash
PORT=7100
```

Nginx **must** proxy to `http://localhost:7100` to serve:
- Dashboard pages: `/d/:token`
- API endpoints: `/api/dashboard/:token`
- Health checks: `/health`

### Routes Served

All routes are handled by the Express server in `src/api/health.ts`:
- `GET /` - API info
- `GET /health` - Health check endpoint
- `GET /d/:token` - Dashboard HTML page (via `src/api/dashboard.ts`)
- `GET /api/dashboard/:token` - Dashboard data API (via `src/api/dashboard.ts`)
- `GET /api/dashboard/:token/past-events` - Past events API (via `src/api/dashboard.ts`)

### SSL Configuration

SSL certificates are managed by Certbot (Let's Encrypt):
- Certificate: `/etc/letsencrypt/live/ailo.digital/fullchain.pem`
- Private key: `/etc/letsencrypt/live/ailo.digital/privkey.pem`
- Auto-renewal configured

## Deployment Commands

### Test Configuration
```bash
nginx -t
```

### Reload Configuration
```bash
systemctl reload nginx
```

### Restart Nginx
```bash
systemctl restart nginx
```

### Check Status
```bash
systemctl status nginx
```

## Troubleshooting

### 502 Bad Gateway Error

If you see "502 Bad Gateway" when accessing https://ailo.digital/d/[token]:

1. **Check if Express server is running**:
   ```bash
   pm2 list
   # Should show "ultrathink" as "online"
   ```

2. **Verify the port**:
   ```bash
   ss -tlnp | grep :7100
   # Should show node process listening on port 7100
   ```

3. **Check nginx proxy configuration**:
   ```bash
   grep proxy_pass /etc/nginx/sites-available/ailo.digital
   # Should show: proxy_pass http://localhost:7100;
   ```

4. **Check nginx error logs**:
   ```bash
   tail -f /var/log/nginx/error.log
   ```

5. **Check Express server logs**:
   ```bash
   pm2 logs ultrathink --lines 50
   ```

### Port Mismatch

If nginx is configured to proxy to the wrong port:
```bash
# Update the configuration
sed -i 's/proxy_pass http:\/\/localhost:WRONG_PORT;/proxy_pass http:\/\/localhost:7100;/' /etc/nginx/sites-available/ailo.digital

# Test and reload
nginx -t && systemctl reload nginx
```

## Change Log

### 2025-10-27
- **Fixed**: Updated `proxy_pass` from port 8080 to port 7100
- **Reason**: Port mismatch causing 502 errors on dashboard URLs
- **Impact**: Personal report feature now working correctly
