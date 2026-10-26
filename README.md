# Smart-ofice-interface

Painel touchscreen do Smart Office (Raspberry Pi 5 + ecrã DSI de 5", 800×480,
Chromium em modo kiosk). Uma única `index.html`, sem build, com HTML, CSS e JavaScript puro.

## Estrutura

```text
index.html            ← única página (painel, modais e área administrativa)
css/style.css         ← painel principal (7 cartões: 4 + 3)
css/admin.css         ← área administrativa
js/dataProvider.js    ← Luz, A.C., Tomada, Timer (Node-RED local) e Clima (Open-Meteo)
js/app.js             ← painel, screensaver, temporizadores, navegação
js/adminApi.js        ← configuração central da API admin + pedidos HTTP (timeout, retry, CSRF)
js/adminAuth.js       ← sessão admin (cookie HttpOnly) e bloqueio por inatividade
js/admin.js           ← vistas: Dashboard, Utilizadores, Acessos RFID, Cartões, Salas e portas,
                        Dispositivos IoT, Permissões, Histórico, Definições
docs/ADMIN_API.md     ← endpoints usados, estado em produção e o que falta
backend/              ← fluxos Node-RED, migração MySQL e bancada de testes (não publicado na Vercel)
```

## Área administrativa

* Botão **Admin / Acessos** no painel → login → dashboard.
* A autenticação é feita **só no backend** (`POST /api/admin/login`). Não há
  credenciais, tokens ou passwords no código nem no `localStorage`.
* Enquanto a área admin está aberta, o screensaver fica em pausa; a área
  bloqueia sozinha após inatividade (3 min por omissão, configurável em Definições).
* Quando o screensaver do kiosk é ativado, a sessão admin é terminada no servidor.
  Ao desbloquear, é preciso voltar a fazer login.
* Endpoints em falta mostram «Funcionalidade indisponível»; nada é simulado.
* **Dispositivos IoT:** adicionar, aprovar pendentes, ativar/desativar, testar comunicação,
  gerar/revogar credenciais. «Ativo» é configuração; «Online» é o heartbeat real (90 s).
* **Acessos RFID:** lista automaticamente os leitores aprovados e ativos; o resultado só
  aparece depois da confirmação do MySQL.

Instalação do backend (migração SQL, CORS com PATCH, fluxos): [backend/README.md](backend/README.md).

Ver [docs/ADMIN_API.md](docs/ADMIN_API.md) para o contrato completo, os requisitos de CORS/cookies e o esquema MySQL.

## Configuração

O URL da API administrativa está em `js/adminApi.js` (`CONFIG.baseUrl`).
Para o substituir sem editar o ficheiro, definir antes dos scripts em `index.html`:

```html
<script>window.SMART_OFFICE_ADMIN_API = "https://api.exemplo.com";</script>
```

O fuso horário do escritório (predefinição `Atlantic/Cape_Verde`) é configurável em **Definições**.

## Deploy na Vercel

Site estático: não há build nem rewrites.

1. Importar o repositório na Vercel com o Framework Preset **Other**, sem build command e com output directory `.`.
2. No Node-RED, adicionar o domínio de produção da Vercel à lista de origens CORS (ver `docs/ADMIN_API.md` §2.3).
3. O cookie de sessão tem de ser `Secure; SameSite=None` enquanto o site e a API estiverem em domínios diferentes.

### Raspberry Pi (kiosk)

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars https://<projeto>.vercel.app
```

O login precisa de teclado. Sem teclado físico, instalar um teclado virtual
(ex.: `squeekboard` no Raspberry Pi OS Bookworm/Wayland).
