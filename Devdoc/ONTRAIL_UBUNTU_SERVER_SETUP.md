# ONTRAIL_UBUNTU_SERVER_SETUP

Remote server setup guide for Ubuntu 22.04 / 24.04.

This setup prepares a production environment for OnTrail services.

------------------------------------------------------------------------

## 1. Update System

``` bash
sudo apt update
sudo apt upgrade -y
```

------------------------------------------------------------------------

## 2. Install Core Dependencies

``` bash
sudo apt install -y curl git build-essential nginx postgresql redis-server python3 python3-pip
```

------------------------------------------------------------------------

## 3. Install Node.js

``` bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

------------------------------------------------------------------------

## 4. Install PM2

``` bash
sudo npm install -g pm2
```

------------------------------------------------------------------------

## 5. Install Docker

``` bash
sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
```

------------------------------------------------------------------------

## 6. PostgreSQL Setup

Create database:

``` bash
sudo -u postgres createuser ontrail
sudo -u postgres createdb ontrail
```

Enter SQL shell:

``` bash
sudo -u postgres psql
```

Example:

``` sql
ALTER USER ontrail WITH PASSWORD 'strongpassword';
```

------------------------------------------------------------------------

## 7. Configure Nginx

Create config:

``` bash
sudo nano /etc/nginx/sites-available/ontrail
```

Example:

    server {
      server_name ontrail.tech *.ontrail.tech;

      location / {
        proxy_pass http://localhost:3000;
      }
    }

Enable site:

``` bash
sudo ln -s /etc/nginx/sites-available/ontrail /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

------------------------------------------------------------------------

## 8. Enable HTTPS

Install Certbot:

``` bash
sudo apt install certbot python3-certbot-nginx
```

Run:

``` bash
sudo certbot --nginx -d ontrail.tech -d *.ontrail.tech
```

------------------------------------------------------------------------

## 9. Deploy API Service

Example:

``` bash
pm2 start api/main.py --name ontrail-api
```

------------------------------------------------------------------------

## 10. Deploy Web App

``` bash
npm install
npm run build
pm2 start npm --name ontrail-web -- start
```

------------------------------------------------------------------------

## 11. Monitoring

Check processes:

``` bash
pm2 status
```

Logs:

``` bash
pm2 logs
```

------------------------------------------------------------------------

## 12. Backups

Database backup:

``` bash
pg_dump ontrail > backup.sql
```

Automate with cron.
