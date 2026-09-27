# 10 — SECURITY AND RBAC

## 1. Arquitetura de Autenticação e Autorização

A NORQVA adota o princípio de **Fail-Closed Security**:
```text
SUPABASE AUTHENTICATION != NORQVA AUTHORIZATION
```
Ter um token válido emitido pelo Supabase Auth apenas atesta a identidade do usuário. A autorização para acessar recursos protegidos da NORQVA exige a existência explícita de um registro correspondente na tabela `users` com papel (`role`) atribuído.

---

## 2. Remediação de Segurança SEC-01 e SEC-02 (Commit `3d1503a`)
Em auditoria pós-Gate 16.6G, foram identificadas e corrigidas cirurgicamente duas vulnerabilidades:
* **SEC-01 (Auto-Provisionamento Inseguro):** O middleware criava automaticamente registros na tabela `users` para qualquer token JWT Supabase válido. **Removido.**
* **SEC-02 (Inferência de Papéis por Heurística de Email):** O sistema atribuía papel de `ADMIN` para e-mails contendo substrings como "admin", "rdmconsultoria" ou "qa_user". **Removido.**

### Estado Atual da Proteção:
1. Se o usuário não existir na tabela `users`, a requisição é rejeitada com `401 Unauthorized`.
2. Se o usuário estiver inativo (`is_active = false`), a requisição é rejeitada com `403 Forbidden`.
3. Os papéis (`ADMIN`, `OPERATOR`, `VIEWER`) são validados exclusivamente pelo valor persistido no banco de dados.

---

## 3. Sanitização e Proteção de Dados Sensíveis
* **Chaves e Tokens:** Nenhuma chave de API, secret de banco ou token de provedores é hardcoded no repositório. Todas as configurações utilizam variáveis de ambiente.
* **CPF / CNPJ do Pagador:** Dados de identificação fiscal em requisições de pagamento são anonimizados ou tratados conforme diretrizes da LGPD, com hashing seguro quando aplicável.
* **Segurança de Webhook:** O webhook do Asaas valida token com comparação em tempo constante para evitar ataques de timing.
