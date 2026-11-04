# NORQVA-0162: lista de Campanhas mostra a situação real da Meta

**Branch:** `ai/NORQVA-0162-situacao-real-na-lista` · **Tipo:** tela, correção de erro (D-0037, sem aprovação) · **Risco:** LOW (só apresentação)

Na gestão diária de 03/11/2026, a lista de Campanhas e o topo de "Gerenciar campanha" mostravam "Ativa" em campanhas de plano que estavam desativadas na Meta (Escala 1, Bordado, Mestre Tito depois da pausa e planos antigos), porque o selo vinha só do plano. Quem lê a tela acha que está gastando.

## Escopo

- `pausedOnMeta`: plano "Ativa" cuja campanha está parada na Meta usa o selo com a situação da Meta. Outros estados do plano, Meta ativa ou sem leitura da Meta: selo do plano, como antes.
- Nada muda em dados, fichas, vigia, mandato ou Meta. Só leitura do que a tela já carrega.
