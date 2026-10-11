/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/borneo_checkout.json`.
 */
export type BorneoCheckout = {
  "address": "Eywhc9M2P3DVhq99LSaVbSye5apTYf6dSwk6uLCTJDEJ",
  "metadata": {
    "name": "borneoCheckout",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initConfig",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "quoteAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "lockQuote",
      "docs": [
        "Borneo's quote service locks a quote for a buyer."
      ],
      "discriminator": [
        241,
        45,
        207,
        21,
        115,
        154,
        208,
        248
      ],
      "accounts": [
        {
          "name": "quoteAuthority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.usdc_mint",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "buyer"
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "arg",
                "path": "quoteId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "quoteId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "lines",
          "type": {
            "vec": {
              "defined": {
                "name": "quoteLine"
              }
            }
          }
        },
        {
          "name": "expiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setQuoteAuthority",
      "discriminator": [
        5,
        22,
        78,
        74,
        8,
        72,
        90,
        85
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.usdc_mint",
                "account": "config"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "quoteAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "settleQuote",
      "docs": [
        "Settle a locked quote. `remaining_accounts` are the merchants' USDC token accounts,",
        "in line order; each must be owned by that line's merchant. Each line is paid exactly",
        "its locked amount from the buyer's USDC account."
      ],
      "discriminator": [
        99,
        181,
        137,
        249,
        106,
        87,
        109,
        216
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true,
          "relations": [
            "quote"
          ]
        },
        {
          "name": "quote",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "quote"
          ]
        },
        {
          "name": "buyerUsdc",
          "writable": true
        },
        {
          "name": "usdcProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "quote",
      "discriminator": [
        167,
        202,
        20,
        198,
        228,
        66,
        105,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "quoteLocked",
      "discriminator": [
        65,
        127,
        82,
        64,
        239,
        126,
        157,
        189
      ]
    },
    {
      "name": "quoteSettled",
      "discriminator": [
        59,
        144,
        13,
        86,
        160,
        45,
        245,
        129
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badLines",
      "msg": "Quote must have 1-6 lines with non-zero amounts"
    },
    {
      "code": 6001,
      "name": "expired",
      "msg": "Quote has expired"
    },
    {
      "code": 6002,
      "name": "alreadyPaid",
      "msg": "Quote is already paid"
    },
    {
      "code": 6003,
      "name": "merchantMismatch",
      "msg": "Merchant account does not match the locked quote"
    },
    {
      "code": 6004,
      "name": "unauthorized",
      "msg": "Signer is not authorized"
    },
    {
      "code": 6005,
      "name": "math",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "quoteAuthority",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "quote",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "quoteId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "total",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "paid",
            "type": "bool"
          },
          {
            "name": "lines",
            "type": {
              "vec": {
                "defined": {
                  "name": "quoteLine"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "quoteLine",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "skuHash",
            "docs": [
              "sha256 of \"store-slug/sku-id\", so the order is auditable onchain."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "quoteLocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "quote",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "total",
            "type": "u64"
          },
          {
            "name": "lines",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "quoteSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "quote",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "total",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
