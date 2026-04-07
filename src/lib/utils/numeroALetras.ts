export function numeroALetras(monto: number): string {
  const unidad = (num: number): string => {
    switch (num) {
      case 1: return 'UN';
      case 2: return 'DOS';
      case 3: return 'TRES';
      case 4: return 'CUATRO';
      case 5: return 'CINCO';
      case 6: return 'SEIS';
      case 7: return 'SIETE';
      case 8: return 'OCHO';
      case 9: return 'NUEVE';
      default: return '';
    }
  };

  const decena = (num: number): string => {
    const un = num % 10;
    const dec = Math.floor(num / 10);
    switch (dec) {
      case 1:
        switch (un) {
          case 0: return 'DIEZ';
          case 1: return 'ONCE';
          case 2: return 'DOCE';
          case 3: return 'TRECE';
          case 4: return 'CATORCE';
          case 5: return 'QUINCE';
          default: return 'DIECI' + unidad(un);
        }
      case 2: return un === 0 ? 'VEINTE' : (un === 1 ? 'VEINTIUN' : 'VEINTI' + unidad(un));
      case 3: return un === 0 ? 'TREINTA' : 'TREINTA Y ' + unidad(un);
      case 4: return un === 0 ? 'CUARENTA' : 'CUARENTA Y ' + unidad(un);
      case 5: return un === 0 ? 'CINCUENTA' : 'CINCUENTA Y ' + unidad(un);
      case 6: return un === 0 ? 'SESENTA' : 'SESENTA Y ' + unidad(un);
      case 7: return un === 0 ? 'SETENTA' : 'SETENTA Y ' + unidad(un);
      case 8: return un === 0 ? 'OCHENTA' : 'OCHENTA Y ' + unidad(un);
      case 9: return un === 0 ? 'NOVENTA' : 'NOVENTA Y ' + unidad(un);
      default: return unidad(un);
    }
  };

  const centena = (num: number): string => {
    const dec = num % 100;
    const cent = Math.floor(num / 100);
    switch (cent) {
      case 1: return dec === 0 ? 'CIEN' : 'CIENTO ' + decena(dec);
      case 2: return 'DOSCIENTOS ' + decena(dec);
      case 3: return 'TRESCIENTOS ' + decena(dec);
      case 4: return 'CUATROCIENTOS ' + decena(dec);
      case 5: return 'QUINIENTOS ' + decena(dec);
      case 6: return 'SEISCIENTOS ' + decena(dec);
      case 7: return 'SETECIENTOS ' + decena(dec);
      case 8: return 'OCHOCIENTOS ' + decena(dec);
      case 9: return 'NOVECIENTOS ' + decena(dec);
      default: return decena(dec);
    }
  };

  const miles = (num: number): string => {
    const divisor = 1000;
    const cien = num % divisor;
    const mil = Math.floor(num / divisor);
    const resultCentena = centena(cien);

    if (mil === 0) return resultCentena;
    if (mil === 1) return 'UN MIL ' + resultCentena;
    return centena(mil) + ' MIL ' + resultCentena;
  };

  const millones = (num: number): string => {
    const divisor = 1000000;
    const milesimo = num % divisor;
    const millon = Math.floor(num / divisor);
    const resultMiles = miles(milesimo);

    if (millon === 0) return resultMiles;
    if (millon === 1) return 'UN MILLON ' + resultMiles;
    return miles(millon) + ' MILLONES ' + resultMiles;
  };

  // Redondear a dos decimales y separar partes
  const redondeado = Number(monto).toFixed(2);
  const partes = redondeado.split('.');
  const enteros = parseInt(partes[0], 10);
  const decimales = partes[1];

  if (enteros === 0) return `CERO PESOS ${decimales}/100 M.N.`;
  const texto = millones(enteros).trim();
  const sufijo = enteros === 1 ? 'PESO' : 'PESOS';
  
  return `${texto} ${sufijo} ${decimales}/100 M.N.`;
}
