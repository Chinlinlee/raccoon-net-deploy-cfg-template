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