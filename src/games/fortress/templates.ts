/**
 * Štartovacia pevnosť, aby dieťa nezačínalo pred prázdnou plochou.
 *
 * Hrad vpravo hore s pokladom, dvere dole (kľúč je vonku vľavo), krehká
 * stena ako tajný vchod zboku, píla hliadkujúca naprieč hradom, bodce pri
 * poklade. A dole „skratka" cez medzeru v múre — hneď za ňou je falošná
 * podlaha. Stojí 31 z 80, takže je kde stavať ďalej.
 *
 * Že sa dá prejsť, overuje test v src/test/fortressEngine.test.ts.
 */
const ROWS = [
  '.........#......',
  '.........#....$.',
  '.........b......',
  '...k.....#...^..',
  '.........#S.....',
  '.........#......',
  '.........###D###',
  '................',
  '................',
  '................',
  '..####.####.....',
  '......o.........',
  '................',
  '................',
  '.E..............',
  '................',
];

export const STARTER_CELLS = ROWS.join('');
