const DEFAULT_DOCKER_COMPOSE = `
x-logging: &logging
  driver: json-file
  options:
    max-size: 50m
    max-file: 3
    
volumes:
  router_modules:
  raccoon_modules:
  
  
configs:
  raccoon-router:
    file: ./raccoon-router.config.js
  raccoon-plugins:
    file: ./raccoon-plugins.config.js
  raccoon-allowed-ae:
    file: ./allowAEs.js
    

services:
  postgres:
    image: postgres
    restart: always
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-postgres\}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-postgres\}
      POSTGRES_DB: \${POSTGRES_DB:-postgres\}
    ports:
      - "5432:5432"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    logging: *logging
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
      
  keycloak:
    image: quay.io/keycloak/keycloak:25.0.6
    command: start
    environment:
      KC_HOSTNAME: \${KC_HOSTNAME:-127.0.0.1\}
      KC_HOSTNAME_PORT: \${KC_HOSTNAME_POST:-8080\}
      KC_HOSTNAME_STRICT_BACKCHANNEL: false
      KC_HTTP_ENABLED: \${KC_HTTP_ENABLED:-true\}
      KC_HOSTNAME_STRICT_HTTPS: \${KC_HOSTNAME_STRICT_HTTPS:-false\}
      KC_HEALTH_ENABLED: \${KC_HEALTH_ENABLED:-true\}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD:-Keycloak@1\}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres/keycloak
      KC_DB_USERNAME: \${POSTGRES_USER:-postgres\}
      KC_DB_PASSWORD: \${POSTGRES_PASSWORD:-postgres\}
    ports:
      - 8080:8080
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./keycloak-dicom-theme.jar:/opt/keycloak/providers/keycloak-theme.jar
      
  nginx:
    image: nginx:1.27.2-alpine
    container_name: nginx
    restart: unless-stopped
    logging: *logging
    ports:
      - 8081:8081
      - 8082:8082
      - 8083:8083
      - 8085:8085
      - 11112:11112
      - 11113:11113
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/myself:/etc/nginx/myself
      - ./nginx/html:/usr/share/nginx/html
      
  fluentd-mongo:
    image: mongo:7.0
    container_name: fluentd-mongo
    volumes:
      - ./raccoon-fluentd-mongo:/data/db
    restart: unless-stopped
    environment:
      TZ: Asia/Taipei
      MONGO_INITDB_ROOT_USERNAME: \${FLUENT_MONGODB_USER:-root\}
      MONGO_INITDB_ROOT_PASSWORD: \${FLUENT_MONGODB_PASSWORD:-root\}
    logging: *logging


  raccoon-router:
    build:
      context: ./dicom-forwarder
      dockerfile: Dockerfile
    image: raccoon-router:1.0.0
    container_name: raccoon-router
    volumes:
      - router_modules:/nodeapp/node_modules
      - ./router-db.sqlite:/nodeapp/data/database.sqlite
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    configs:
      - source: raccoon-router
        target: /nodeapp/config/index.js
  
  raccoon-router-frontend:
    env_file:
      - ./router-ui.env
    build:
      context: ./dicom-forwarder-ui
      dockerfile: Dockerfile
    image: raccoon-router-frontend:1.0.0
    container_name: raccoon-router-frontend
    depends_on:
      - raccoon-router
    restart: unless-stopped
    
  raccoon-dicom:
    #glpat-7wzNA9v9-NMf7-oiHTCQ
    image: gitlab-registry.dicom.tw/a5566qq123/raccoon-dicom:2.3.0
    env_file:
      - ./raccoon.env
    deploy:
      mode: replicated
      replicas: 4
    configs:
      - source: raccoon-plugins
        target: /nodejs/raccoon/plugins/config.js
      - source: raccoon-allowed-ae
        target: /nodejs/raccoon/config/allowAEs.js
    volumes:
      - ./raccoon-stroage:/dicomFiles
      - raccoon_modules:/nodejs/raccoon/node_modules
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    logging: *logging

  raccoon-dicom-ui:
    build:
      context: ./dicom-forwarder-ui
      dockerfile: Dockerfile
    image: raccoon-dicom-ui:1.0.0
    container_name: raccoon-dicom-ui
    restart: unless-stopped
`;

document.addEventListener('alpine:init', () => {
  // Toast 管理器
  Alpine.data('toastManager', () => ({
    show: false,
    message: '',

    showMessage(msg, duration = 3000) {
      this.message = msg;
      this.show = true;

      setTimeout(() => {
        this.show = false;
      }, duration);
    },

    hide() {
      this.show = false;
    },

    init() {
      // 監聽自定義事件
      window.addEventListener('show-toast', (e) => {
        this.showMessage(e.detail.message, e.detail.duration);
      });
    },

    destroy() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      window.removeEventListener('show-toast', this.showMessage);
    }
  }));

  Alpine.data('dockerConfig', () => ({
    activeTab: 'postgres',
    availableServices: [
      { name: 'postgres' },
      { name: 'keycloak' },
      { name: 'nginx' },
      { name: 'fluentd-mongo' },
      { name: 'raccoon-router' },
      { name: 'raccoon-router-frontend' },
      { name: 'raccoon-dicom' },
      { name: 'raccoon-dicom-ui' },
      { name: 'BlueLight' }
    ],
    selectedServices: [],
    config: {
      postgresUser: 'postgres',
      postgresPassword: 'postgres',
      keycloak: {
        adminPassword: 'Keycloak@1',
        hostname: '127.0.0.1',
        hostnamePort: '8080',
        httpEnabled: 'true',
        hostnameStrictHttps: 'false',
        healthEnabled: 'true'
      }
    },
    generatedFiles: [],
    originalCompose: null,

    async init() {
      try {
        try {
          const response = await fetch('data/docker-compose-example.yaml');
          const yamlText = await response.text();
          this.originalCompose = YAML.parse(yamlText);
        } catch (e) {
          this.originalCompose = YAML.parse(DEFAULT_DOCKER_COMPOSE);
        }
      } catch (error) {
        console.error('無法載入 docker-compose 範例:', error);
        alert('載入配置文件失敗');
      }
    },

    showToastMessage(message) {
      // 使用自定義事件來觸發 toast
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: {
          message,
          duration: 3000
        }
      }));
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
    listen      8081;
    listen      [::]:8081;
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
        const pluginsConfigContent = this.generateRaccoonPluginsConfig();
        this.generatedFiles.push({
          name: 'raccoon-plugins.config.js',
          content: pluginsConfigContent
        });
        const allowAeContent = this.generateRaccoonAllowAeConfig();
        this.generatedFiles.push({
          name: 'allowAEs.js',
          content: allowAeContent
        });

        if (!this.generatedFiles.find(file => file.name === 'nginx/conf.d/raccoon.conf')) {
          this.generateRaccoonNginxConfig();
        }
      }

      if (this.selectedServices.includes('raccoon-dicom-ui')) {
        let raccoonUiEnv = this.generateRaccoonUiEnvConfig();
        this.generatedFiles.push({
          name: 'router-ui.env.js',
          content: raccoonUiEnv
        });
      }

      this.$nextTick(() => {
        this.showToastMessage('配置文件生成成功!');
      });
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
      return yamlString
        .replace(/\${POSTGRES_USER:-postgres}/g, this.config.postgresUser)
        .replace(/\${POSTGRES_PASSWORD:-postgres}/g, this.config.postgresPassword)
        .replace(/\${KEYCLOAK_ADMIN_PASSWORD:-Keycloak@1}/g, this.config.keycloak.adminPassword)
        .replace(/\${KC_HOSTNAME:-127.0.0.1}/g, this.config.keycloak.hostname)
        .replace(/\${KC_HOSTNAME_POST:-8080}/g, this.config.keycloak.hostnamePort)
        .replace(/\${KC_HTTP_ENABLED:-true}/g, this.config.keycloak.httpEnabled)
        .replace(/\${KC_HOSTNAME_STRICT_HTTPS:-false}/g, this.config.keycloak.hostnameStrictHttps)
        .replace(/\${KC_HEALTH_ENABLED:-true}/g, this.config.keycloak.healthEnabled);
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
SERVER_PORT=8081
SERVER_SESSION_SECRET_KEY="asao9yudoMad"

# DICOM Web
DICOM_STORE_ROOTPATH="/dicomFiles"
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

    generateRaccoonPluginsConfig() {
      return `
module.exports.pluginsConfig = {
    "helloWorld": {
        enable: false,
        before: true,
        routers: [
            {
                path: "/dicom-web/studies",
                method: "get"
            },
            {
                path: "/dicom-web/studies/:studyUID/instances",
                method: "get"
            }
        ]
    },
    "syncToFhirServer": {
        enable: false,
        before: false,
        routers: [
            {
                path: "/dicom-web/studies",
                method: "post"
            }
        ],
        fhir: {
            server: {
                baseUrl: "http://127.0.0.1/fhir"
            }
        }
    },
    "dicomdir": {
        enable: false,
        before: true,
        routers: [
            {
                path: "/dicom-web/dicomdir",
                method: "get"
            }
        ]
    },
    "oauth": {
        enable: false,
        before: true,
        routers: [
            {
                path: "*",
                method: "get"
            }
        ],
        server: {
            url: "http://127.0.0.1:8080",
            realm: "realm",
            clientId: "clientId",
            clientSecret: "clientSecret"
        },
        acl: {
            // In best practice, you should setting the acl
            enable: false,
            roles: [
                {
                    name: "admin",
                    routers: [
                        { path: "/admin/*", method: "GET" },
                        { path: "/api/*", method: "*" }
                    ]
                },
                {
                    name: "user",
                    routers: [
                        { path: "/api/public/*", method: "GET" }
                    ]
                }
            ]
        }
    },
    "statistic-mongodb": {
        enable: false,
        before: true,
        // we don't need to add any routers here
        // just remain empty
        routers: [],
        mongodb: {
            hosts: ["127.0.0.1"],
            ports: [27017],
            dbName: "raccoon-logs",
            urlOptions: "",
            user: "root",
            password: "root",
            authSource: "admin"
        }
    },
    "hl7-server": {
        enable: false,
        before: true,
        routers: [],
        port: 7777
    }
};
`;
    },
    generateRaccoonAllowAeConfig() {
      return `
module.exports.allowAEs = {
    // Allowed ae list to call Raccoon
    sources: {
        find: [
            {
                aeTitle: "ANYSCU",
                host: "localhost",
                port: 1234
            }
        ],
        move: [
            {
                aeTitle: "ANYSCU",
                host: "localhost",
                port: 1234
            }
        ],
        store: [
            {
                aeTitle: "ANYSCU",
                host: "localhost",
                port: 1234
            }
        ]
    },
    // Allowed ae list from Raccoon.
    remotes: [
        {
            aeTitle: "STORESCP",
            host: "localhost",
            port: 11113
        },
        {
            aeTitle: "STORESCP_TLS",
            host: "localhost",
            port: 2762,
            cipherSuites: [
                "SSL_RSA_WITH_NULL_SHA",
                "TLS_RSA_WITH_AES_128_CBC_SHA",
                "TLS_RSA_WITH_3DES_EDE_CBC_SHA"
            ]
        },
        {
            aeTitle: "STGCMTSCU",
            host: "localhost",
            port: 11115
        },
        {
            aeTitle: "STGCMTSCU_TLS",
            host: "localhost",
            port: 12762,
            cipherSuites: [
                "SSL_RSA_WITH_NULL_SHA",
                "TLS_RSA_WITH_AES_128_CBC_SHA",
                "TLS_RSA_WITH_3DES_EDE_CBC_SHA"
            ]
        },
        {
            aeTitle: "MOVESCU",
            host: "localhost",
            port: 1234
        }
    ]
};
      `;
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

      if (this.selectedServices.includes('raccoon-dicom-ui')) {
        this.generatedFiles.push({
          name: 'nginx/conf.d/raccoon-ui.conf',
          content: `server {
    listen      8083;
    listen      [::]:8083;
    server_name localhost;
      
    # security
    include     myself/security.conf;
      
    # logging
    access_log  /var/log/nginx/access.log combined buffer=512k flush=1m;
    error_log   /var/log/nginx/error.log warn;
    root /usr/share/nginx/html/raccoon-ui;
      
    # React application serving under /raccoon-ui
    location / {
        index index.html;
        try_files $uri $uri/ /index.html =404;  # Prevent infinite redirection cycle
    }
      
    location /static {
        alias /usr/share/nginx/html/raccoon-ui/static;
        expires max;
        add_header Cache-Control "public";
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
    generateRaccoonUiEnvConfig() {
      return `
window._env_ = {
    REACT_APP_PACS_PATH: " <PACS_URL> ",
    REACT_APP_VIEWER_PATH: " <VIEWER_URL> ",
    REACT_APP_USE_KEYCLOAK: "true",
    REACT_APP_KEYCLOAK_PATH: " <KEYCLOAK_URL> ",
    REACT_APP_KEYCLOAK_REALM: " <REALM_NAME> ",
    REACT_APP_KEYCLOAK_CLIENT_ID: " <CLIENT_ID> ",
    REACT_APP_KEYCLOAK_CLIENT_SECRET: " <CLIENT_SECRET> ",
}
`;
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
      const blob = await zip.generateAsync({ type: 'blob' });
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
        if (!selectedServices.includes('fluentd-mongo')) {
          selectedServices.push('fluentd-mongo');
        }
      }

      if(selectedServices.includes('raccoon-dicom-ui')) {
        if (!selectedServices.includes('nginx')) {
          selectedServices.push('nginx');
        }
      }

      if (selectedServices.includes('keycloak') ||
          selectedServices.includes('raccoon-dicom') ||
          selectedServices.includes('raccoon-router')
        ) {
        if (!selectedServices.includes('postgres')) {
          selectedServices.push('postgres');
        }
      }
    },
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToastMessage('已複製到剪貼簿');
        }).catch(err => {
            console.error('複製失敗:', err);
            this.showToastMessage('複製失敗');
        });
    },
  }));
}); 