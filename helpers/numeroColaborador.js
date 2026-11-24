// O campo numero_colaborador tem um indice UNICO global na tabela
// (nao e unico por organizacao). Por isso a numeracao nao pode reiniciar em
// COL-00001 para cada organizacao: a primeira pessoa de uma organizacao nova
// entraria em colisao com a primeira pessoa da organizacao ja existente e o
// CREATE falharia com "Numero de colaborador ja existe".
//
// Funcao pura para facilitar testes: recebe todos os numeros ja usados e
// devolve o proximo numero livre, ignorando formatos antigos/irregulares.

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
