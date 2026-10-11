/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/intatto.json`.
 */
export type Intatto = {
  "address": "6SPpSd6984j65tmNMJh3SgUxqeUbFFrDXaiisSu9oX1C",
  "metadata": {
    "name": "intatto",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "borrow",
      "docs": [
        "Borrow USDC. Refused if the price is stale or the new loan-to-value would",
        "exceed the limit for the current market session."
      ],
      "discriminator": [
        228,
        253,
        131,
        202,
        207,
        116,
        89,
        18
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "ownerUsdc",
          "writable": true
        },
        {
          "name": "usdcVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "usdcProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "ownerCollateral",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initMarket",
      "discriminator": [
        33,
        253,
        15,
        116,
        89,
        25,
        127,
        236
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "collateralMint"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "usdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "collateralProgram"
        },
        {
          "name": "usdcProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "marketParams"
            }
          }
        }
      ]
    },
    {
      "name": "liquidate",
      "docs": [
        "Liquidate an unhealthy position in slices: repay at most `max_slice_bps` of the",
        "debt per call and receive collateral worth the repaid amount plus a bonus.",
        "If collateral runs out, the unpaid remainder is written off as recorded bad debt."
      ],
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "liquidatorUsdc",
          "writable": true
        },
        {
          "name": "liquidatorCollateral",
          "writable": true
        },
        {
          "name": "usdcVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "usdcProgram"
        },
        {
          "name": "collateralProgram"
        }
      ],
      "args": [
        {
          "name": "repayAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "repay",
      "docs": [
        "Repay is always open: any session, stale price or not."
      ],
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone may repay on behalf of a position."
          ],
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "payerUsdc",
          "writable": true
        },
        {
          "name": "usdcVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "usdcProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setParams",
      "docs": [
        "Admin can retune risk parameters (never the keeper)."
      ],
      "discriminator": [
        27,
        234,
        178,
        52,
        147,
        2,
        187,
        141
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "marketParams"
            }
          }
        }
      ]
    },
    {
      "name": "supply",
      "docs": [
        "Lenders supply USDC to the pool."
      ],
      "discriminator": [
        81,
        67,
        116,
        61,
        250,
        209,
        5,
        198
      ],
      "accounts": [
        {
          "name": "lender",
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "lenderUsdc",
          "writable": true
        },
        {
          "name": "usdcVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "usdcProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateMarket",
      "docs": [
        "Keeper relays price (USDC atoms per whole token) and market session.",
        "A single update cannot move the price more than `max_price_move_bps`."
      ],
      "discriminator": [
        153,
        39,
        2,
        197,
        179,
        50,
        199,
        217
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "session",
          "type": "u8"
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Withdraw collateral. Needs a fresh price and must stay within the session limit."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "market",
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "ownerCollateral",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "marketUpdated",
      "discriminator": [
        170,
        51,
        74,
        147,
        116,
        168,
        217,
        251
      ]
    },
    {
      "name": "positionChanged",
      "discriminator": [
        185,
        99,
        23,
        242,
        206,
        25,
        115,
        41
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "sessionLimit",
      "msg": "New borrowing would exceed the loan-to-value limit for the current market session"
    },
    {
      "code": 6001,
      "name": "stalePrice",
      "msg": "Price is stale: the keeper has not updated recently, so new borrowing is paused"
    },
    {
      "code": 6002,
      "name": "priceMoveTooLarge",
      "msg": "Price update moves more than the allowed bound in one step"
    },
    {
      "code": 6003,
      "name": "healthy",
      "msg": "Position is healthy and cannot be liquidated"
    },
    {
      "code": 6004,
      "name": "insufficientCollateral",
      "msg": "Not enough collateral"
    },
    {
      "code": 6005,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6006,
      "name": "badPrice",
      "msg": "Invalid price"
    },
    {
      "code": 6007,
      "name": "badSession",
      "msg": "Invalid session"
    },
    {
      "code": 6008,
      "name": "badParams",
      "msg": "Invalid market parameters"
    },
    {
      "code": 6009,
      "name": "unauthorized",
      "msg": "Signer is not authorized"
    },
    {
      "code": 6010,
      "name": "math",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "collateralVault",
            "type": "pubkey"
          },
          {
            "name": "usdcVault",
            "type": "pubkey"
          },
          {
            "name": "collateralDecimals",
            "type": "u8"
          },
          {
            "name": "usdcDecimals",
            "type": "u8"
          },
          {
            "name": "price",
            "docs": [
              "USDC atoms per one whole collateral token."
            ],
            "type": "u64"
          },
          {
            "name": "priceUpdatedAt",
            "type": "i64"
          },
          {
            "name": "session",
            "type": "u8"
          },
          {
            "name": "limitBps",
            "type": {
              "array": [
                "u16",
                4
              ]
            }
          },
          {
            "name": "liqBps",
            "type": "u16"
          },
          {
            "name": "liqBonusBps",
            "type": "u16"
          },
          {
            "name": "maxSliceBps",
            "type": "u16"
          },
          {
            "name": "maxPriceMoveBps",
            "type": "u16"
          },
          {
            "name": "maxStalenessSecs",
            "type": "i64"
          },
          {
            "name": "totalSupplied",
            "type": "u64"
          },
          {
            "name": "totalDebt",
            "type": "u64"
          },
          {
            "name": "badDebt",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "collateralVaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "limitBps",
            "docs": [
              "New-borrow LTV limit per session [Regular, Extended, Overnight, Closed], in bps."
            ],
            "type": {
              "array": [
                "u16",
                4
              ]
            }
          },
          {
            "name": "liqBps",
            "type": "u16"
          },
          {
            "name": "liqBonusBps",
            "type": "u16"
          },
          {
            "name": "maxSliceBps",
            "type": "u16"
          },
          {
            "name": "maxPriceMoveBps",
            "type": "u16"
          },
          {
            "name": "maxStalenessSecs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "session",
            "type": "u8"
          },
          {
            "name": "limitBps",
            "type": "u16"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "debt",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "positionChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "debt",
            "type": "u64"
          },
          {
            "name": "action",
            "type": "string"
          }
        ]
      }
    }
  ]
};
