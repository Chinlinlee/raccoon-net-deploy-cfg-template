document.addEventListener('alpine:init', () => {
    Alpine.data('dockerConfig', () => ({
        availableServices: [
            { name: 'postgres' },
            { name: 'keycloak' },
            { name: 'nginx' },
            { name: 'fluentd-mongo' },
            { name: 'raccoon-router' },
            { name: 'raccoon-router-frontend' },
            { name: 'raccoon-dicom' },
            { name: 'BlueLight' }
        ],
        selectedServices: [],
        config: {
            postgresUser: 'postgres',
            postgresPassword: 'postgres'
        },
        generatedFiles: [],
        originalCompose: null,

        async init() {
            try {
                const response = await fetch('data/docker-compose-example.yaml');
                const yamlText = await response.text();
                this.originalCompose = YAML.parse(yamlText);
            } catch (error) {
                console.error('無法載入 docker-compose 範例:', error);
                alert('載入配置文件失敗');
            }
        },

        generateConfigs() {
            if (!this.originalCompose) {
                alert('配置模板尚未載入');
                return;
            }

            this.generatedFiles = [];
            
            // 生成 docker-compose.yaml
            const composePath = 'docker-compose.yaml';
            const composeContent = this.generateDockerCompose();
            this.generatedFiles.push({
                name: composePath,
                content: composeContent
            });

            // 生成 nginx 配置文件
            if (this.selectedServices.includes('nginx')) {
                this.generateNginxConfigs();
            }

            if (this.selectedServices.includes('BlueLight')) {
                const raccoonConf = `server {
    listen      80;
    listen      [::]:80;
    server_name _;

    # security
    include     myself/security.conf;

    # logging
    access_log  /var/log/nginx/access.log combined buffer=512k flush=1m;
    error_log   /var/log/nginx/error.log warn;
    root /usr/share/nginx/html;

    # reverse proxy
    location / {
        proxy_pass            http://raccoon-dicom:8081;
        proxy_set_header Host $host;
        include               myself/proxy.conf;
        
        # CORS settings
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, DELETE, PUT';
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With';

        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, DELETE, PUT';
            add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With';
            add_header 'Access-Control-Max-Age' 86400;
            return 204;
        }
    }
    
    location /bluelight {
      alias /usr/share/nginx/html/bluelight;
      index index.html;
    }
    
    location /BLV {
      alias /usr/share/nginx/html/bluelight/viewer;
      index index.html;
    }
    
    location /BLS {
      alias /usr/share/nginx/html/bluelight/search;
      index index.html;
    }
    
    location /image/ {
      rewrite ^/image/(.*)$ /bluelight/image/$1 break;
    }
}`;
                this.generatedFiles.push({
                    name: 'nginx/conf.d/raccoon.conf',
                    content: raccoonConf
                });
            }

            // 如果選擇了 raccoon-dicom，生成 raccoon.env
            if (this.selectedServices.includes('raccoon-dicom')) {
                const envContent = this.generateRaccoonEnv();
                this.generatedFiles.push({
                    name: 'raccoon.env',
                    content: envContent
                });

                if (!this.generatedFiles.find(file => file.name === 'nginx/conf.d/raccoon.conf')) {
                    this.generateRaccoonNginxConfig();
                }
            }
        },

        generateDockerCompose() {
            // 複製必要的頂層配置
            const newCompose = {
                'x-logging': this.originalCompose['x-logging'],
                volumes: {},
                configs: {},
                services: {}
            };

            // 根據選擇的服務過濾 volumes
            Object.entries(this.originalCompose.volumes || {}).forEach(([key, value]) => {
                if (this.shouldIncludeVolume(key)) {
                    newCompose.volumes[key] = value;
                }
            });

            // 根據選擇的服務過濾 configs
            Object.entries(this.originalCompose.configs || {}).forEach(([key, value]) => {
                if (this.shouldIncludeConfig(key)) {
                    newCompose.configs[key] = value;
                }
            });

            // 過濾服務
            this.selectedServices.forEach(serviceName => {
                if (this.originalCompose.services[serviceName]) {
                    newCompose.services[serviceName] = this.originalCompose.services[serviceName];
                }
            });

            // 替換環境變數
            const yamlString = YAML.stringify(newCompose);
            return yamlString.replace(/\${POSTGRES_USER:-postgres}/g, this.config.postgresUser)
                           .replace(/\${POSTGRES_PASSWORD:-postgres}/g, this.config.postgresPassword);
        },

        shouldIncludeVolume(volumeName) {
            // 根據選擇的服務決定是否需要包含特定的 volume
            const volumeServiceMap = {
                'router_modules': ['raccoon-router'],
                'raccoon_modules': ['raccoon-dicom'],
                // 添加其他 volume 對應關係
            };

            return volumeServiceMap[volumeName] ? 
                   volumeServiceMap[volumeName].some(service => this.selectedServices.includes(service)) :
                   true;
        },

        shouldIncludeConfig(configName) {
            // 根據選擇的服務決定是否需要包含特定的 config
            const configServiceMap = {
                'raccoon-router': ['raccoon-router'],
                'raccoon-plugins': ['raccoon-dicom'],
                'raccoon-allowed-ae': ['raccoon-dicom'],
                // 添加其他 config 對應關係
            };

            return configServiceMap[configName] ?
                   configServiceMap[configName].some(service => this.selectedServices.includes(service)) :
                   true;
        },

        generateRaccoonEnv() {
            return `DB_TYPE=sql

# SQL
SQL_HOST=postgres
SQL_PORT=5432
SQL_DB="raccoon"
SQL_TYPE="postgres"
SQL_USERNAME=${this.config.postgresUser}
SQL_PASSWORD=${this.config.postgresPassword}
SQL_LOGGING=false
SQL_FORCE_SYNC=false
SQL_ALTER_SYNC=false

# Server
SERVER_PORT=8082
SERVER_SESSION_SECRET_KEY="asao9yudoMad"

# DICOM Web
DICOM_STORE_ROOTPATH="H:/raccoon-sql-storage/test"
DICOMWEB_HOST="{host}"
DICOMWEB_PORT=8081
DICOMWEB_API="dicom-web"
DICOMWEB_AE="RACCOON"

# DICOM DIMSE
ENABLE_DIMSE=true
DIMSE_CHECK_STORE_SCU_AE=false
DIMSE_CHECK_FIND_SCU_AE=false
DIMSE_CHECK_MOVE_SCU_AE=false
DIMSE_AE_TITLE="RACCOON" 
DIMSE_HOSTNAME="0.0.0.0"
DIMSE_PORT=11112

# DIMSE TLS
DIMSE_ENABLE_TLS=false
DIMSE_TLS_CIPHER=["SSL_RSA_WITH_NULL_SHA","TLS_RSA_WITH_AES_128_CBC_SHA","SSL_RSA_WITH_3DES_EDE_CBC_SHA"]
DIMSE_TLS_PROTOCOL=["TLSv1.3","TLSv1.2","TLSv1.1","TLSv1"]
DIMSE_TLS_NOAUTH=false
DIMSE_KEY_STORE="./config/certs/key.p12"
DIMSE_KEY_STORE_TYPE="PKCS12"
DIMSE_KEY_STORE_PASS="secret"
DIMSE_KEY_PASS="secret"
DIMSE_TRUST_STORE="./config/certs/cacerts.p12"
DIMSE_TRUST_STORE_TYPE="PKCS12"
DIMSE_TRUST_STORE_PASS="secret"`;
        },

        generateNginxConfigs() {
            // nginx.conf
            this.generatedFiles.push({
                name: 'nginx/nginx.conf',
                content: `worker_processes  auto;

error_log  /var/log/nginx/error.log notice;
pid        /var/run/nginx.pid;

events {
    multi_accept       on;
    worker_connections 65535;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    charset                utf-8;
    sendfile               on;
    tcp_nopush             on;
    tcp_nodelay            on;
    server_tokens          off;
    log_not_found          off;
    types_hash_max_size    2048;
    types_hash_bucket_size 64;
    client_max_body_size   0;

    # Connection header for WebSocket reverse proxy
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ""      close;
    }

    map $remote_addr $proxy_forwarded_elem {
        # IPv4 addresses can be sent as-is
        ~^[0-9.]+$        "for=$remote_addr";

        # IPv6 addresses need to be bracketed and quoted
        ~^[0-9A-Fa-f:.]+$ "for=\"[$remote_addr]\"";

        # Unix domain socket names cannot be represented in RFC 7239 syntax
        default           "for=unknown";
    }

    map $http_forwarded $proxy_add_forwarded {
        # If the incoming Forwarded header is syntactically valid, append to it
        "~^(,[ \\t]*)*([!#$%&'*+.^_\`|~0-9A-Za-z-]+=([!#$%&'*+.^_\`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?(;([!#$%&'*+.^_\`|~0-9A-Za-z-]+=([!#$%&'*+.^_\`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?)*([ \\t]*,([ \\t]*([!#$%&'*+.^_\`|~0-9A-Za-z-]+=([!#$%&'*+.^_\`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?(;([!#$%&'*+.^_\`|~0-9A-Za-z-]+=([!#$%&'*+.^_\`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?)*)?)*$" "$http_forwarded, $proxy_forwarded_elem";

        # Otherwise, replace it
        default "$proxy_forwarded_elem";
    }

    gzip            on;
    gzip_vary       on;
    gzip_proxied    any;
    gzip_comp_level 6;
    gzip_types      text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    include /etc/nginx/conf.d/*.conf;
}

stream {
    upstream raccoon_dimse {
        least_conn;
        server raccoon:11112;
    }

    server {
        listen 11112;
        proxy_pass raccoon_dimse;
    }
}`
            });

            // proxy.conf
            this.generatedFiles.push({
                name: 'nginx/myself/proxy.conf',
                content: `proxy_http_version                 1.1;
proxy_cache_bypass                 $http_upgrade;

# Proxy SSL
proxy_ssl_server_name              on;

# Proxy headers
proxy_set_header Upgrade           $http_upgrade;
proxy_set_header Connection        $connection_upgrade;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header Forwarded         $proxy_add_forwarded;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Port  $server_port;

# Proxy timeouts
proxy_connect_timeout              60s;
proxy_send_timeout                 60s;
proxy_read_timeout                 60s;`
            });

            // security.conf
            this.generatedFiles.push({
                name: 'nginx/myself/security.conf',
                content: `# security headers
add_header X-XSS-Protection        "1; mode=block" always;
add_header X-Content-Type-Options  "nosniff" always;
add_header Referrer-Policy         "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self' http: https: ws: wss: data: blob: 'unsafe-inline'; frame-ancestors 'self';" always;
add_header Permissions-Policy      "interest-cohort=()" always;

# . files
location ~ /\.(?!well-known) {
    deny all;
}`
            });

            if (this.selectedServices.includes('raccoon-router-frontend')) {
                this.generatedFiles.push({
                    name: 'nginx/conf.d/raccoon-router-ui.conf',
                    content: `server {
    listen      8085;
    listen      [::]:8085;
    server_name localhost;

    # security
    include     myself/security.conf;

    # logging
    access_log  /var/log/nginx/access.log combined buffer=512k flush=1m;
    error_log   /var/log/nginx/error.log warn;

    # reverse proxy
    location / {
        proxy_pass            http://raccoon-router-frontend:3000;
        proxy_set_header Host $host;
        include              myself/proxy.conf;
    }
}`
                });
            }
        },

        generateRaccoonNginxConfig() {
            // 根據選擇的服務生成特定的配置文件
            if (this.selectedServices.includes('raccoon-dicom')) {
                this.generatedFiles.push({
                    name: 'nginx/conf.d/raccoon.conf',
                    content: `server {
    listen      80;
    listen      [::]:80;
    server_name localhost;

    # security
    include     myself/security.conf;

    # logging
    access_log  /var/log/nginx/access.log combined buffer=512k flush=1m;
    error_log   /var/log/nginx/error.log warn;

    # reverse proxy
    location / {
        proxy_pass            http://raccoon-dicom:8081;
        proxy_set_header Host $host;
        include              myself/proxy.conf;
    }
}`
                });
            }
        },

        downloadFile(file) {
            const blob = new Blob([file.content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            window.URL.revokeObjectURL(url);
        },

        async downloadAllFiles() {
            const zip = new JSZip();
            
            // 將所有文件添加到 zip
            this.generatedFiles.forEach(file => {
                // 處理路徑中的目錄結構
                const paths = file.name.split('/');
                let folder = zip;
                
                // 如果文件在子目錄中，創建對應的目錄結構
                if (paths.length > 1) {
                    const dirPath = paths.slice(0, -1).join('/');
                    folder = zip.folder(dirPath);
                }
                
                // 添加文件到對應的目錄
                const fileName = paths[paths.length - 1];
                folder.file(fileName, file.content);
            });
            
            // 生成 zip 文件並下載
            const blob = await zip.generateAsync({type: 'blob'});
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'docker-configs.zip';
            a.click();
            window.URL.revokeObjectURL(url);
        },

        // 監聽 selectedServices 的變化
        initAlpine() {
            this.$watch('selectedServices', (value) => {
                this.handleDependencies(value);
            });
        },

        // 處理服務依賴關係
        handleDependencies(selectedServices) {
            if (selectedServices.includes('raccoon-dicom')) {
                // 確保必要的依賴服務被選中
                if (!selectedServices.includes('postgres')) {
                    selectedServices.push('postgres');
                }
                if (!selectedServices.includes('fluentd-mongo')) {
                    selectedServices.push('fluentd-mongo');
                }
            }
        }
    }));
}); 