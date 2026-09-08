# Configurar CORS no Node-RED (Raspberry Pi)

O frontend (`http://localhost:3000`) e o Node-RED (`http://10.11.0.135:1880`) estão em
origens diferentes. O browser bloqueia o `fetch()` a menos que o **Node-RED** devolva os
headers CORS corretos — isto **não se resolve no frontend**.

O browser faz sempre dois pedidos para `POST /api/ac`:

1. `OPTIONS /api/ac` (preflight) — tem de responder `204` com os headers CORS.
2. `POST /api/ac` (o pedido real) — a resposta também tem de incluir `Access-Control-Allow-Origin`.

Há duas formas de resolver. Escolhe uma (a Opção A é a mais simples e cobre todos os
endpoints, incluindo `/api/lights/*`, `/api/outlets/*` e `/api/timers`).

---

## Opção A (recomendada): CORS global no `settings.js`

No Raspberry Pi, edita o ficheiro de configuração do Node-RED (normalmente
`~/.node-red/settings.js`) e adiciona/edita a propriedade `httpNodeCors`:

```js
module.exports = {
    // ...resto da configuração existente...

    httpNodeCors: {
        origin: "*", // ou "http://localhost:3000" para restringir
        methods: "GET,POST,PUT,DELETE,OPTIONS",
        allowedHeaders: "Content-Type, Authorization",
    },
}
```

Depois reinicia o Node-RED:

```bash
node-red-stop
node-red-start
# ou, se corre como serviço:
sudo systemctl restart nodered
```

Isto faz o Node-RED responder automaticamente a qualquer `OPTIONS` de preflight e
adicionar `Access-Control-Allow-Origin` a todas as respostas de todos os `http in`
nodes — não precisas de mexer em cada flow.

Em produção, troca `origin: "*"` por `origin: "http://localhost:3000"` (ou o domínio
real de onde o frontend for servido).

---

## Opção B: tratar CORS manualmente no flow (por endpoint)

Usa esta opção se não tiveres acesso ao `settings.js` ou preferires controlar CORS
endpoint a endpoint.

### B.1 — Handler para `OPTIONS /api/ac`

Importa o flow abaixo no Node-RED: menu ☰ → **Import** → cola o JSON → **Import**.

```json
[
    {
        "id": "smartoffice-cors-tab",
        "type": "tab",
        "label": "Smart Office - CORS AC",
        "disabled": false,
        "info": ""
    },
    {
        "id": "ac-options-in",
        "type": "http in",
        "z": "smartoffice-cors-tab",
        "name": "OPTIONS /api/ac",
        "url": "/api/ac",
        "method": "options",
        "upload": false,
        "swaggerDoc": "",
        "x": 150,
        "y": 120,
        "wires": [["ac-options-headers"]]
    },
    {
        "id": "ac-options-headers",
        "type": "change",
        "z": "smartoffice-cors-tab",
        "name": "CORS headers + 204",
        "rules": [
            {
                "t": "set",
                "p": "statusCode",
                "pt": "msg",
                "to": "204",
                "tot": "num"
            },
            {
                "t": "set",
                "p": "headers",
                "pt": "msg",
                "to": "{\"Access-Control-Allow-Origin\":\"*\",\"Access-Control-Allow-Methods\":\"POST, OPTIONS\",\"Access-Control-Allow-Headers\":\"Content-Type, Authorization\"}",
                "tot": "json"
            },
            {
                "t": "set",
                "p": "payload",
                "pt": "msg",
                "to": "",
                "tot": "str"
            }
        ],
        "action": "",
        "property": "",
        "from": "",
        "to": "",
        "reg": false,
        "x": 380,
        "y": 120,
        "wires": [["ac-options-response"]]
    },
    {
        "id": "ac-options-response",
        "type": "http response",
        "z": "smartoffice-cors-tab",
        "name": "204 No Content",
        "statusCode": "",
        "headers": {},
        "x": 610,
        "y": 120,
        "wires": []
    }
]
```

Isto cria: `http in (OPTIONS /api/ac)` → `change (define statusCode 204 + headers CORS)`
→ `http response`. Depois de importar, clica **Deploy**.

Para testes locais podes trocar `Access-Control-Allow-Origin` de `*` para
`http://localhost:3000` no nó `change`, se preferires restringir a origem.

### B.2 — Adicionar os mesmos headers na resposta do `POST /api/ac`

No flow existente que trata `POST /api/ac` (o que já fala com a SmartThings e o
Samsung WindFree), insere um nó **Change** entre o processamento atual e o nó final
**http response**, com esta regra:

- **Set** `msg.headers` (JSON) para:

```json
{
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
}
```

Ou seja: `[http in POST /api/ac] → ... (lógica existente com SmartThings) ... → [change: headers CORS] → [http response]`.

Se já tiveres um nó `change`/`function` a preparar a resposta, basta acrescentar lá o
`msg.headers` acima em vez de criar um nó novo.

> Durante testes locais podes usar `*`. Para produção, usa
> `Access-Control-Allow-Origin: http://localhost:3000` (ou o domínio real do frontend).

---

## Como testar

No Raspberry Pi ou noutra máquina na mesma rede:

```bash
# Preflight — deve devolver 204 e os headers Access-Control-Allow-*
curl -i -X OPTIONS http://10.11.0.135:1880/api/ac \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"

# POST real — a resposta também deve incluir Access-Control-Allow-Origin
curl -i -X POST http://10.11.0.135:1880/api/ac \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"on": true}'
```

Se ambos os pedidos devolverem os headers `Access-Control-Allow-*`, o browser deixa de
bloquear o `fetch()` e o frontend em `http://localhost:3000` passa a comunicar
corretamente com o Node-RED.
