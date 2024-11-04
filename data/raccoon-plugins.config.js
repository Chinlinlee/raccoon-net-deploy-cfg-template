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
            },
            {
                path: "*",
                method: "delete"
            }
        ],
        server: {
            url: "http://162.38.2.1:8080",
            realm: "dog",
            clientId: "account",
            clientSecret: "mqPS2Y374uUXoFoOAucdNwIqL6MN0m8m"
        },
        adminRouters: [
            {
                path: "audit-log",
                method: "get"
            }
        ]
    },
    "statistic-mongodb": {
        enable: false,
        before: true,
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
    },
    getStudyFhir: {
        enable: false,
        before: true,
        routers: []
    }
};