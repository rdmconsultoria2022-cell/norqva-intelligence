// Erro de regra do WhatsApp com o código HTTP a devolver para a tela.
// Fica em arquivo próprio para os módulos do motor oficial (NORQVA-0079) usarem sem import circular.
export class WhatsAppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
