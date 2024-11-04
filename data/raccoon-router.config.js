module.exports.config = {
    locale: "zh-TW",
    port: 11112,
    hostname: "0.0.0.0",
    aeTitle: "FORWARDER",
    storeDir: "./temp",
    /** @type { import("knex").Knex.Config } */
    database: {
        // Please refer to the connection method of knex when using it as an SQL query builder.
        client: "better-sqlite3",
        // connection: ":memory:",
        pool: {
            destroyTimeoutMillis: 360000 * 1000,
            idleTimeoutMillis: 360000 * 1000 
        },
        connection: {
            filename: "./data/database.sqlite",
        },
        useNullAsDefault: true
    },
    // Using cron format
    routeCron: "*/30 * * * * *",
    deleteCompletedImagesCron: "",
    resendFailedTaskCron: "*/30 * * * * *",
    // Using TZ identifier from https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
    timeZone: "Asia/Taipei",
    imageExpireTime: "1d",
    // Disk usage threshold in percent, use number between 0 and 100
    diskSafeUsageThreshold: 80,
    maxRetry: 3,
    remoteTimeout: "5s",
    checkRemoteAvailableWhenCreating: false,
    keycloakOAuth: {
        enable: false,
        // app url, used for redirect to the app when user login successfully (required)
        server: {
            url: "keycloak.example.com",
            realm: "realm",
            useHttps: false
        },
        clientId: "",
        clientSecret: "",
        excludedPatterns: ["/health", "/openapi"]
    },
    checkScu: {
        enable: false,
        allowAEs: [
            {
                aeTitle: "FORWARDER",
                host: "123456",
                port: 11112
            }
        ]
    }
};