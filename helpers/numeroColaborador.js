// Numeracao de colaboradores e POR ORGANIZACAO: cada org comeca em COL-00001.
// O controle de duplicados e feito pelo indice UNICO composto
// (organizacao_id, numero_colaborador) na tabela.
//
// Funcao pura para facilitar testes: recebe os numeros ja usados DENTRO DA
// MESMA ORGANIZACAO e devolve o proximo, ignorando formatos irregulares.

var proximoNumeroColaborador = function (numeros) {
  var maior = 0;
  (numeros || []).forEach(function (valor) {
    if (valor === null || valor === undefined) return;
    var match = String(valor).match(/(\d+)\s*$/);
    if (!match) return;
    var numero = parseInt(match[1], 10);
    if (!isNaN(numero) && numero > maior) maior = numero;
  });
  return "COL-" + String(maior + 1).padStart(5, "0");
};

module.exports = { proximoNumeroColaborador };
