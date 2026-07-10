
# Schedule App

## Fluxo de desenvolvimento

### 1. Ver mudanças no Android Studio

Abra a pasta `schedule-app` no Android Studio.

- `View > Tool Windows > Commit`: mostra arquivos modificados e não rastreados
- `Git > Show History`: histórico por arquivo
- `Git > Show Git Log`: histórico geral do projeto

Arquivos como `.idea/` e `.expo/` são locais e não devem ir para o repositório.

### 2. Rodar no aparelho virtual

Pré-requisitos:

- Android Studio com um emulador criado
- Node.js instalado
- Dependências instaladas com `npm install`

Com o emulador aberto:

```bash
npm run android
```

Para iniciar o servidor Metro separadamente:

```bash
npm run start
```

Se estiver usando development build:

```bash
npm run start:dev
```

### 3. Atualizar o app já instalado no celular

Este projeto já usa `expo-updates` e EAS Update.

Você pode publicar update OTA quando a mudança envolver apenas:

- JavaScript / React Native
- imagens, fontes e outros assets empacotados
- lógica de tela e comportamento do app

Publique em produção com:

```bash
npm run update:production
```

Publique em preview com:

```bash
npm run update:preview
```

### 4. Quando OTA não basta

Você precisa gerar uma nova build APK/AAB quando mudar:

- código nativo Android
- permissões nativas
- dependências nativas
- `android/`
- `app.json` em partes que afetam runtime nativo
- `runtimeVersion`

Nesses casos, faça nova build com EAS ou rode nova instalação local no aparelho/emulador.

### 5. Regra prática

- Mudou tela, estado, cálculo, texto, asset: tente `eas update`
- Mudou algo nativo ou pacote nativo: gere nova build
