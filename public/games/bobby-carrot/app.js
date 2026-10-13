// Bobby Carrot Remastered - Standalone Bundle (Zero-Dependency & Universal Browser Support)
(function() {
"use strict";

// --- 1. LEVELS DEFINITIONS ---
// Bobby Carrot Levels generated from levels.odin
const TILE_CHARS = {
  '.': 'Grass',
  ' ': 'Ground',
  '@': 'Start',
  'o': 'End',
  '*': 'Carrot',
  '=': 'Fence',
  'x': 'Trap',
  'X': 'Trap_Activated',
  '<': 'Belt_Left',
  '>': 'Belt_Right',
  '^': 'Belt_Up',
  'v': 'Belt_Down',
  '|': 'Wall_Left_Right',
  '-': 'Wall_Up_Down',
  '⌝': 'Wall_Right_Up',
  '⌞': 'Wall_Left_Down',
  '⌜': 'Wall_Left_Up',
  '⌟': 'Wall_Right_Down',
  'R': 'Red_Button',
  'r': 'Red_Button_Pressed',
  'Y': 'Yellow_Button',
  'y': 'Yellow_Button_Pressed',
  's': 'Silver_Key',
  'S': 'Silver_Lock',
  'g': 'Golden_Key',
  'G': 'Golden_Lock',
  'c': 'Copper_Key',
  'C': 'Copper_Lock',
  'e': 'Egg_Spot',
  'E': 'Egg'
};

const CARROT_LEVELS = [
  [
    ".........",
    "...   ...",
    ".   o   .",
    ". ===== .",
    ". =***= .",
    ". =***= .",
    ". =***= .",
    ". == == .",
    ".       .",
    ".   @   .",
    "...   ...",
    "........."
  ],
  [
    "...........",
    "....   ....",
    ".... o ....",
    ".         .",
    ". ===x=== .",
    ". =*****= .",
    ". =* * *= .",
    ". =*****= .",
    ". ===x=== .",
    ".         .",
    "....   ....",
    ".... @ ....",
    "....   ....",
    "..........."
  ],
  [
    ".........",
    ".... ....",
    "... o ...",
    ".       .",
    ".... ....",
    "..**x**..",
    "..**x**..",
    "..**x**..",
    ".... ....",
    ".... ....",
    "...   ...",
    "... @ ...",
    "...   ...",
    "........."
  ],
  [
    "..............",
    "..  =========.",
    "..  =***=***=.",
    "..  x***x***=.",
    "..  =***=***=.",
    "..  ======x==.",
    ".   =***=***=.",
    ". @ x*o*x***=.",
    ".   =***=***=.",
    "..  =========.",
    ".............."
  ],
  [
    "...............",
    "....... .......",
    "...... o ......",
    ".x           x.",
    ".*.....x.....*.",
    ".*.....*.....*.",
    ".*...**x**...*.",
    ".x   **.**   x.",
    ".....**x**.....",
    "....... .......",
    "....... .......",
    "......   ......",
    "...... @ ......",
    "......   ......",
    "..............."
  ],
  [
    "...............",
    "........   ....",
    "..*  x   o ....",
    ".. .....   ....",
    "..x......x.....",
    ".. ..**     **.",
    "..*  ** === **.",
    ".....**     **.",
    ".......x...x...",
    ".......*xxx*...",
    ".......x...x...",
    ".   ..  ***  ..",
    ". @     *x*  ..",
    ".   ..  ***  ..",
    "..............."
  ],
  [
    "...............",
    ".***..***..***.",
    ".** xx * xx **.",
    ".*  ..   ..  *.",
    "..x....x....x..",
    "..x....x....x..",
    ".*  ..   ..  *.",
    ".** xx o xx **.",
    ".*  ..   ..  *.",
    "..x....x....x..",
    "..x....x....x..",
    ".   ..   ..  *.",
    ". @ xx * xx **.",
    ".   ..***..***.",
    "..............."
  ],
  [
    "..............",
    ".   ..  ......",
    ". o >>  x*x*x.",
    ".   ..  .x*.*.",
    ".   ..  .*x*x.",
    ". @ <<  xx*x..",
    ".   ..  ..x*..",
    ".............."
  ],
  [
    "...........",
    ".***...***.",
    ".*@*>>>***.",
    ".***...***.",
    "..v..... ..",
    "..v..... ..",
    ".   ...***.",
    ". o x*x***.",
    ".   ...***.",
    "..........."
  ],
  [
    ".........",
    "..  o  ..",
    "..     ..",
    "..x=x=x..",
    ".**=*=**.",
    ".**=v=**.",
    ".**=*=**.",
    ".x==x==x.",
    ".       .",
    "....^....",
    "....^....",
    "...   ...",
    "... @ ...",
    "...***...",
    "........."
  ],
  [
    "...............",
    "....** o **....",
    "....=== ===....",
    ".x           x.",
    ".*...x=x=x...*.",
    ".*<<<*=*=*<<<*.",
    ".*...==x==...*.",
    ".x           x.",
    ".....     .....",
    ".......^.......",
    ".......^.......",
    "......   ......",
    "...... @ ......",
    "......***......",
    "..............."
  ],
  [
    "................",
    "........***.....",
    "..  ....***   ..",
    ".. x<<  ***.. ..",
    "..  ..^..v... ..",
    "..  ..^..v... ..",
    ".  x>> x***..xx.",
    ".@  ====***..xo.",
    ".  x<< x***..xx.",
    "..  ......... ..",
    "..  ......... ..",
    ".. x>>x ***.. ..",
    "..  ... ***.. ..",
    "....... ***   ..",
    "........***.....",
    "................"
  ],
  [
    ".............",
    "...... *** ..",
    "...... ... ..",
    "...... ... ..",
    ".   .. ..   .",
    ". @ x*|*x o .",
    ".   .. ..   .",
    ".. ... ......",
    ".. ... ......",
    ".. *** ......",
    "............."
  ],
  [
    ".............",
    "......x***x..",
    "...... ... ..",
    "...... ... ..",
    ".. ***⌝*** ..",
    ".. ... ... ..",
    ".. ... ... ..",
    ".   .. ..   .",
    ". @ x*|*x o .",
    ".   .. ..   .",
    ".. ... ... ..",
    ".. ... ... ..",
    ".. ***⌞*** ..",
    "............."
  ],
  [
    "................",
    "......    ..***.",
    "......   ⌝  ***.",
    ".   .. .. ..***.",
    ". @   ⌝.. ...v..",
    ".   .....      .",
    ".........  |.| .",
    "....   ..  ⌞*⌞ .",
    ".... o     |.| .",
    "....   ..      .",
    "................"
  ],
  [
    "................",
    ".=====......y...",
    ".=*** Y.       .",
    ".=*** .. ===v==.",
    ".=*** << x<y  =.",
    ".=    ..^=****=.",
    ".==-==..^=****=.",
    ".     ..^=****=.",
    ". @ R << =Y   =.",
    ".     ..y======.",
    ".. o ...........",
    "................"
  ],
  [
    "..............",
    ".....***......",
    ".....* *......",
    "..... R ......",
    "......|.......",
    ".** .   .. **.",
    ".* r- @ x-R *.",
    ".** .   .. **.",
    "...x..|...x...",
    ".   < x <   ..",
    ". Y .***. o ..",
    ".   .***.   ..",
    ".............."
  ],
  [
    "................",
    "........   .....",
    "....***C   S***.",
    "....***.. ..***.",
    ".........r......",
    ".....          .",
    ".  Rr  ⌜-⌝.⌜-⌝ .",
    ".=     |s⌟.⌞c| .",
    ".=***  ⌞-----⌟ .",
    ".=***=         .",
    ".==G==..........",
    "..   ..   ......",
    ".. @ .. g -o....",
    "..        ......",
    "................"
  ],
  [
    "...............",
    "..........⌜--⌝.",
    "..........|Rr|.",
    "..........|**|.",
    "..........⌞-⌟|.",
    "..x*x*x ⌝....|.",
    "..|. . .|....|.",
    ".@ *x*x |    ⌟.",
    "..|. . .|.. ==.",
    "..x*x*x ⌟..   .",
    "........... o .",
    "...........   .",
    "..............."
  ],
  [
    ".........",
    ".x**x**x.",
    ".*.. ..*.",
    ".*.. ..s.",
    ".x**S**C.",
    ".*.. ..*.",
    ".*.. ..*.",
    ".c**x**x.",
    ".*.. ..*.",
    ".*.. ..*.",
    ".x  @  x.",
    ".... ....",
    "....o....",
    "........."
  ],
  [
    "...............",
    ".         xxxx.",
    ".         =v=*.",
    ". ------- =*=*.",
    ". =*=R=y= =*=*.",
    ". =*=*=*= =*=*.",
    ". =*=*=*= =*=^.",
    ". =*<*<*= xxxx.",
    ". ======= xxxx.",
    ".    Y    ====.",
    ".@        - o .",
    "..............."
  ],
  [
    "...............",
    "....o   .......",
    "......  .......",
    "......⌜⌝.......",
    "......|*...***.",
    "......|x...*y*.",
    "......Y^...***.",
    "......x ....v..",
    "..x***    -CR*.",
    ".*⌜---  @ ====.",
    ".. x*x    -*rc.",
    ".......|=|.....",
    ".......*=*.....",
    ".......R=r.....",
    "..............."
  ],
  [
    "................",
    "......     ****.",
    "..   |     ****.",
    "..r...     ****.",
    "..|...=====    .",
    "..  Yy |R |    .",
    "..     =====^==.",
    ".r     R=      .",
    ".. ⌜|⌝ == **** .",
    "..x|*|x.. **** .",
    ".. ⌞|⌟*.. **** .",
    "..ox=**.. **** .",
    "..@ =....   y  .",
    "..===...........",
    "................"
  ],
  [
    "................",
    "..⌜x*x⌝......r..",
    "..x⌜.⌜x...   **.",
    ".ox***x r ⌞||**.",
    "..x⌟.⌟x..R-RR...",
    "..⌞x*x⌟..x⌜-x...",
    "........ *x* ...",
    "........ = =v...",
    "........ =@=v...",
    "........ === ...",
    "........     ...",
    "................"
  ],
  [
    "...............",
    ".....*.........",
    "...x*⌟*x.......",
    "...*===*.⌜⌝....",
    ".*.*=*=*.||....",
    ".R.s<R<G.|*-Y*.",
    ".-..= =..-...^.",
    ". .. ⌟ .. ...^.",
    ".@       o S  .",
    ". ===|=-..|....",
    ". | gY= ..x....",
    ". =====y..x....",
    ". -R*=**.. ....",
    ". ====**..*....",
    ". -r*=**R *....",
    "..............."
  ],
  [
    "................",
    ".      @       .",
    ".*=*=*=*=*=*=*=.",
    ".*=*=*=*=*=*=*=.",
    ".*=*=s=*=x=*=x=.",
    ".x=*=*=*=*=*=x=.",
    ".*=*=*=-=x=*=*=.",
    ".*=r=*x*=g=*=S=.",
    ".*=*=*=*=*x|x*=.",
    ".x=*x⌜=x=*=*=*=.",
    ".*x*=*=x=*=*=*=.",
    ".*=G=*=*=*=R=*=.",
    ".*=*=*=*=*=*=*=.",
    ".o=*=*x*=*=⌞ *=.",
    "................"
  ],
  [
    "...............",
    ".......... @ ..",
    "..........*-x..",
    "..........x-*..",
    ".......... ⌞⌟*.",
    "..         .|..",
    ".  =====  --⌟..",
    ".  =R r=====...",
    ".  =    ****...",
    ".  =x-⌝........",
    ".  = ||........",
    ".o xx⌟⌟*rR.....",
    ".  --⌝|........",
    ".....⌞⌟........",
    "..............."
  ],
  [
    "................",
    "....*  x y x  *.",
    ".... ......... .",
    ".... ...***... .",
    ".... >xY***yx< .",
    ".x  Y...***...Y.",
    ".*== ......... .",
    ".x  ⌜*** o ***⌝.",
    ".... ===   === .",
    "....x**x @ x**x.",
    "........   .....",
    "................"
  ],
  [
    "................",
    ".......   x*x  .",
    ".......   . .  .",
    ".......  ⌞*-*⌟ .",
    ".==      ..o.. .",
    ".=*⌜x ..x..... .",
    ".=R|x ..*..... .",
    ".=*⌞x ..x*x*x  .",
    ".==@  ..*⌝*..  .",
    ".=*⌞x x*x*x..  .",
    ".=r-x ....*..  .",
    ".=*⌟x ....x..  .",
    ".==            .",
    "................"
  ],
  [
    "...............",
    ".............o.",
    ".......** ... .",
    ".......v.y...|.",
    ".R.....v.⌝⌜ * .",
    ".S=*=⌜ @  ⌟..x.",
    ".*=r=*..  ...x.",
    ".|=|= ..  ...s.",
    ".      Yx     .",
    ".      ====== .",
    "..... xx****  .",
    "..............."
  ]
];

const EGG_LEVELS = [
  [
    ".......",
    ".. @ ..",
    ".     .",
    ".e=== .",
    ".e=== .",
    ".eeeee.",
    ".eeeee.",
    ".eeoee.",
    ".eeeee.",
    "......."
  ],
  [
    "..........",
    "..   @....",
    "..    ....",
    "..  ......",
    "..⌞⌝......",
    "..⌞⌟......",
    ".Ye eeeee.",
    ".x  e<e ⌝.",
    "..⌞⌝......",
    "..⌞⌟......",
    "..⌞⌟......",
    ".     ....",
    ".  o  ....",
    ".........."
  ],
  [
    "............",
    "....@   eee.",
    "....  = eXe.",
    "....  = ⌝ e.",
    ".... ee |==.",
    ".eeeeeee|x..",
    ".eeeeeee⌟e..",
    ".eeXee......",
    ". eeeo......",
    "............"
  ],
  [
    "...............",
    ".             .",
    ".  ⌜⌜⌜   ⌝⌝⌝  .",
    ". ⌝|e|⌝ ⌝|e|⌞ .",
    ". ⌝|e|⌝ ⌜|e|⌝ .",
    ".  ⌜⌜⌜ @ ⌜⌟⌟  .",
    ".     R r     .",
    ".      o      .",
    ".  ⌞⌞   ⌟⌞⌟⌟⌟ .",
    ". ⌞--⌞  ⌟---⌝ .",
    ". ⌞ee⌞  ⌞eee⌟ .",
    ". ⌞--⌞  ⌟---⌞ .",
    ".  ⌞⌞   ⌜⌟⌞⌟⌟ .",
    ".             .",
    "..............."
  ],
  [
    "................",
    ".  R  |⌜⌞|  R  .",
    ". ee  =ee=  ee .",
    ". ee  =ee=  ee .",
    ".     =e =     .",
    ".     =  =     .",
    ". =====  =====|.",
    ".⌝eee  @R  eee|.",
    ".⌟eee  ro  eee|.",
    ". =====  =====|.",
    ".   R =ee= r   .",
    ". ee  =ee=  ee .",
    ". ee  =ee=  ee .",
    ".     -⌜⌝-     .",
    "................"
  ],
  [
    "..................",
    "..e====.....  ===.",
    ".. =ee=.....  ⌝e=.",
    "..  ⌜⌝ ..ee  ⌜⌟e=.",
    ".. ⌞⌟  ..e== ⌞ ==.",
    "..       e==    ..",
    "..... ===e==e== ..",
    "..... ===⌝eereeo..",
    "..    eee@==e== ..",
    ".== ⌝ ===e==e== ..",
    ".=e⌜⌟ ===e=R    ..",
    ".=e⌞  =  ⌟  ⌜⌝  ..",
    ".==   =e...  ⌞⌟ ..",
    "..     e... =ee=..",
    "............====..",
    ".................."
  ],
  [
    "................",
    ".ye> Ye   =⌝ee@.",
    ".e= ===   = == .",
    ".e=            .",
    ".⌜             .",
    ".e=.. =|=|==== .",
    ".v=.. =e=eeRe- .",
    ".  .. =r=e==== .",
    ".     = =eee⌜- .",
    ".==   e⌟eee= = .",
    ".⌝    ====e=e= .",
    ".e=.. -Reee=e= .",
    ".e=.. ====x=|= .",
    ".o=..          .",
    "................"
  ],
  [
    "...............",
    ".            o.",
    ". =e========= .",
    ". =eyceeeeeRe .",
    ". =e=e=====S= .",
    ". =e=Yee<Ree= .",
    ". =e=eXeXr=e= .",
    ". =g=⌞esye=e= .",
    ". =e=eXeXe=v= .",
    ". =eGee⌝e⌝=e= .",
    ". =e=====e=e= .",
    ". e⌟eeReeCer= .",
    ". =========e= .",
    ".@           Y.",
    "..............."
  ],
  [
    "...............",
    ".            o.",
    ". =====e=e=e= .",
    ". eeeee⌝=e=e= .",
    ". =====c=v=r= .",
    ". eeRe<e=e=e= .",
    ". =====e=e=e= .",
    ". e⌝ese⌝eSe⌝e .",
    ". =e=e=e===== .",
    ". =e=R=Cee>ee .",
    ". =Y=e=e===== .",
    ". =e=e=yeeree .",
    ". =e=e=e===== .",
    ".@            .",
    "..............."
  ],
  [
    "................",
    ".......e........",
    ".......Y........",
    ".......R........",
    ".......|........",
    "....oS   -rye...",
    "...... @ .......",
    "......    ......",
    ".     v==^    =.",
    ".      ==   =|=.",
    ".=|=|=|==|=|=R=.",
    ".=R=R=r==R=r=y=.",
    ".=Y=e=e==e=Y=s=.",
    ".==========e===.",
    "................"
  ],
  [
    "................",
    ".             @.",
    ".   ==  ==ee== .",
    ". =e==e===ye== .",
    ". =ReY⌝=ee--ee⌝.",
    ". =e== =ee--ee⌜.",
    ". =e==e===ee== .",
    ". ee>er= =vv== .",
    ". ====e===ee== .",
    ".   eeeoee--e= .",
    ".   ===eee--e= .",
    "... ===e==ee== .",
    "...    ⌞==ee== .",
    "...       ⌝⌟   .",
    "................"
  ],
  [
    "................",
    ".......       ..",
    "....... ===== ..",
    "....... = @ = ..",
    "....... =eee= ..",
    "....... =eve= ..",
    "....... = e = ..",
    ".       = ve=  .",
    ".========| |===.",
    ".eeeX    ⌟|⌞ s=.",
    ".eeee⌝ == c =e=.",
    ".eeeee =    =e=.",
    ".eeeCX g⌝ o Ge=.",
    ".===   eeS=====.",
    "................"
  ],
  [
    "...............",
    "..           ..",
    ".    . ..     .",
    ".  ..yeee..   .",
    ".  ..eere..   .",
    ". =ee-ee-ee=  .",
    ".  eRe..eRe   .",
    ". =eee..eYe=  .",
    ". =re|ee|ee=  .",
    ".  ..e<<e..   .",
    ".  ........   .",
    ".    ....     .",
    ".             .",
    "..   o  @    ..",
    "..............."
  ],
  [
    "...............",
    ".             .",
    ". ==== @ ==== .",
    ". =ree   eeR= .",
    ". =e=== ===e= .",
    ". =e=⌞eee⌜=e= .",
    ".   =e⌟|⌝e=   .",
    ".   =e⌟-⌜e=   .",
    ". =e=⌟ree⌜=e= .",
    ". =e=== ===e= .",
    ". =Ree   eer= .",
    ". ==== o ==== .",
    ".             .",
    "..............."
  ],
  [
    "................",
    ".eeeeeee=======.",
    ".eee⌜⌝⌝    ⌝   .",
    ".eee⌟⌟⌟   = e= .",
    ".====     =e =e.",
    ".       === o e.",
    ".     === ==== .",
    ". ===xee= -Re= .",
    ".   =x|e= -R== .",
    ". ⌟|=x||=@-re= .",
    ". -r= |e= ==== .",
    ". ⌞e= ||= |    .",
    ". === e^====== .",
    ".    <<<eee    .",
    "................"
  ],
  [
    "................",
    ".    ..ee..Y=ee.",
    ".  o ..ee..  ⌜e.",
    ".    eeeeRe@   .",
    ". ===ee==ee=== .",
    ". eee<<ec⌟eeee .",
    ". eRe==ee==eee .",
    "....Yer||ee^....",
    "....eee||ee^....",
    ". eeg==ee==eee .",
    ". eeeRyee⌝ ree .",
    ". ===ee==ee=== .",
    ".eee⌟eeCGee⌝eee.",
    ".eeee..ee.. eee.",
    "................"
  ],
  [
    "................",
    ".====    -|re=e.",
    ".=⌜-⌝    =====c.",
    ".eC⌜⌝  y  eee=r.",
    ".=||⌞     eY-=|.",
    ".=⌞--    =eee=S.",
    ".======= ===^= .",
    ".  e e =      @.",
    ".  ⌞-| = =  == .",
    ".  ⌞-⌟ = =eee= .",
    ". =s=  = =eYe=G.",
    ". =r= ee >e|g=|.",
    ". ====== =====R.",
    ".        -|Ro=e.",
    "................"
  ],
  [
    "................",
    ".ee-   ===   ee.",
    ".er⌜   =e=  ⌟er.",
    ".ee-   =C=  -ee.",
    ".==  ===@=== ==.",
    ".ee⌟   e e   ee.",
    ".Re⌝ =v=e=v= eR.",
    ".ee⌝ =v=c=v= ee.",
    "...  =eeeee.....",
    "........e ......",
    "........ .......",
    "........o.......",
    "................"
  ],
  [
    "................",
    ".eee   Ceeeeeee.",
    ".e=e...eeeeeeee.",
    ".e=e...e===e=e .",
    ".Ye⌞e⌝eReee-eee.",
    ".R=e= =e=o=e==^.",
    ".e=e=s=e=e=ceee.",
    ".S eere⌜e⌟ee==e.",
    ".g...e...e=Reey.",
    ".e...e@..e=e..e.",
    ".e...=v..e=e..e.",
    ".⌟eeeG ..e=e..e.",
    ".e=e=eeeereeeee.",
    ".eee=...........",
    "................"
  ],
  [
    "................",
    ".    =====e    .",
    ".v==e=eee=e===v.",
    ". ee⌜ ⌝-⌜ ⌝  e .",
    ". == = e = ===Y.",
    ".    =   =    e.",
    ".    = @ =     .",
    ".    =   =     .",
    ".    = o =     .",
    "==v===   ===^===",
    ".   ee   ee    .",
    ".   ==   ==    .",
    ".ee   ⌝-⌜    R .",
    ".ee  =eee=     .",
    ".....=====......",
    "................"
  ]
];

// --- 2. AUDIO SYNTHESIZER ---
// Bobby Carrot Remastered - Web Audio Synthesizer (Retro 8-bit Sound Effects)

class RetroAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.4;
    this.initialized = false;
  }

  init() {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initialized = true;
      }
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  // Play a synthesized note or sequence
  playTone(freq, type = 'square', duration = 0.1, gainVal = 0.15) {
    if (this.muted || !this.ctx) return;
    this.init();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(gainVal * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // SOUND EFFECTS
  playStep() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Soft footstep click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.05 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  playCarrot() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Cheerful double chime (picking a carrot)
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);
      gain.gain.setValueAtTime(0.2 * this.volume, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.08);
    });
  }

  playEgg() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Egg placed in spot: warm hollow plop
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.09);
    gain.gain.setValueAtTime(0.25 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playButton() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Mechanical click / switch toggle
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.setValueAtTime(420, now + 0.03);
    gain.gain.setValueAtTime(0.18 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playKey() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Key pickup bell
    const now = this.ctx.currentTime;
    [880, 1174.66, 1760].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);
      gain.gain.setValueAtTime(0.2 * this.volume, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.12);
    });
  }

  playLock() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Padlock unlocking click
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.setValueAtTime(800, now + 0.04);
    gain.gain.setValueAtTime(0.22 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playTrap() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Snap of metal spikes
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    gain.gain.setValueAtTime(0.3 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playDeath() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Descending sad retro defeat
    const now = this.ctx.currentTime;
    [320, 280, 240, 180, 120].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.25 * this.volume, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.12);
    });
  }

  playLevelComplete() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Victorious fanfare
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.25 * this.volume, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.2);
    });
  }

  playBelt() {
    if (this.muted || !this.ctx) return;
    this.init();
    // Belt sliding whoosh
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.08);
    gain.gain.setValueAtTime(0.12 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }
}

const audio = new RetroAudio();

// --- 3. SPRITE MANAGER ---
// Bobby Carrot Remastered - Sprite Manager & Auto-tiler

const SPRITE_PATHS = {
  // General & Screens
  font: 'assets/font.png',
  logo: 'assets/logo.png',
  intro_splash: 'assets/intro_splash.png',
  end_splash: 'assets/end_splash.png',

  // Tiles
  start: 'assets/tiles/start.png',
  end_1: 'assets/tiles/end_1.png',
  end_2: 'assets/tiles/end_2.png',
  end_3: 'assets/tiles/end_3.png',
  end_4: 'assets/tiles/end_4.png',
  ground: 'assets/tiles/ground.png',
  grass: 'assets/tiles/grass.png',
  grass_right: 'assets/tiles/grass_right.png',
  grass_left: 'assets/tiles/grass_left.png',
  grass_down: 'assets/tiles/grass_down.png',
  grass_up: 'assets/tiles/grass_up.png',
  grass_right_down: 'assets/tiles/grass_right_down.png',
  grass_left_down: 'assets/tiles/grass_left_down.png',
  grass_left_up: 'assets/tiles/grass_left_up.png',
  grass_right_up: 'assets/tiles/grass_right_up.png',
  grass_down_up_right_left: 'assets/tiles/grass_down_up_right_left.png',
  grass_down_up: 'assets/tiles/grass_down_up.png',
  grass_right_left: 'assets/tiles/grass_right_left.png',
  fence_right_left: 'assets/tiles/fence_right_left.png',
  fence_down: 'assets/tiles/fence_down.png',
  fence_right_down: 'assets/tiles/fence_right_down.png',
  fence_left_down: 'assets/tiles/fence_left_down.png',
  fence_right: 'assets/tiles/fence_right.png',
  fence_left: 'assets/tiles/fence_left.png',
  carrot: 'assets/tiles/carrot.png',
  carrot_hole: 'assets/tiles/carrot_hole.png',
  trap: 'assets/tiles/trap.png',
  trap_activated: 'assets/tiles/trap_activated.png',
  red_button: 'assets/tiles/red_button.png',
  red_button_pressed: 'assets/tiles/red_button_pressed.png',
  wall_left_up: 'assets/tiles/wall_left_up.png',
  wall_right_up: 'assets/tiles/wall_right_up.png',
  wall_right_down: 'assets/tiles/wall_right_down.png',
  wall_left_down: 'assets/tiles/wall_left_down.png',
  wall_up_down: 'assets/tiles/wall_up_down.png',
  wall_left_right: 'assets/tiles/wall_left_right.png',
  yellow_button: 'assets/tiles/yellow_button.png',
  yellow_button_pressed: 'assets/tiles/yellow_button_pressed.png',
  belt_left_1: 'assets/tiles/belt_left_1.png',
  belt_left_2: 'assets/tiles/belt_left_2.png',
  belt_left_3: 'assets/tiles/belt_left_3.png',
  belt_left_4: 'assets/tiles/belt_left_4.png',
  belt_right_1: 'assets/tiles/belt_right_1.png',
  belt_right_2: 'assets/tiles/belt_right_2.png',
  belt_right_3: 'assets/tiles/belt_right_3.png',
  belt_right_4: 'assets/tiles/belt_right_4.png',
  belt_up_1: 'assets/tiles/belt_up_1.png',
  belt_up_2: 'assets/tiles/belt_up_2.png',
  belt_up_3: 'assets/tiles/belt_up_3.png',
  belt_up_4: 'assets/tiles/belt_up_4.png',
  belt_down_1: 'assets/tiles/belt_down_1.png',
  belt_down_2: 'assets/tiles/belt_down_2.png',
  belt_down_3: 'assets/tiles/belt_down_3.png',
  belt_down_4: 'assets/tiles/belt_down_4.png',
  copper_key: 'assets/tiles/copper_key.png',
  copper_lock: 'assets/tiles/copper_lock.png',
  silver_key: 'assets/tiles/silver_key.png',
  silver_lock: 'assets/tiles/silver_lock.png',
  golden_key: 'assets/tiles/golden_key.png',
  golden_lock: 'assets/tiles/golden_lock.png',
  egg_spot: 'assets/tiles/egg_spot.png',
  egg: 'assets/tiles/egg.png',

  // HUD
  hud_font: 'assets/hud/font.png',
  hud_carrot: 'assets/hud/carrot.png',
  hud_egg: 'assets/hud/egg.png',
  hud_eyes: 'assets/hud/eyes.png',
  hud_silver_key: 'assets/hud/silver_key.png',
  hud_golden_key: 'assets/hud/golden_key.png',
  hud_copper_key: 'assets/hud/copper_key.png',
  hud_success: 'assets/hud/success.png',
  hud_arrow_right: 'assets/hud/arrow_right.png',
  hud_arrow_up: 'assets/hud/arrow_up.png',

  // Bobby Idle (3 frames)
  idle_1: 'assets/animations/idle_1.png',
  idle_2: 'assets/animations/idle_2.png',
  idle_3: 'assets/animations/idle_3.png',

  // Bobby Walk Down (8 frames)
  walking_down_1: 'assets/animations/walking_down_1.png',
  walking_down_2: 'assets/animations/walking_down_2.png',
  walking_down_3: 'assets/animations/walking_down_3.png',
  walking_down_4: 'assets/animations/walking_down_4.png',
  walking_down_5: 'assets/animations/walking_down_5.png',
  walking_down_6: 'assets/animations/walking_down_6.png',
  walking_down_7: 'assets/animations/walking_down_7.png',
  walking_down_8: 'assets/animations/walking_down_8.png',

  // Bobby Walk Left (8 frames)
  walking_left_1: 'assets/animations/walking_left_1.png',
  walking_left_2: 'assets/animations/walking_left_2.png',
  walking_left_3: 'assets/animations/walking_left_3.png',
  walking_left_4: 'assets/animations/walking_left_4.png',
  walking_left_5: 'assets/animations/walking_left_5.png',
  walking_left_6: 'assets/animations/walking_left_6.png',
  walking_left_7: 'assets/animations/walking_left_7.png',
  walking_left_8: 'assets/animations/walking_left_8.png',

  // Bobby Walk Up (8 frames)
  walking_up_1: 'assets/animations/walking_up_1.png',
  walking_up_2: 'assets/animations/walking_up_2.png',
  walking_up_3: 'assets/animations/walking_up_3.png',
  walking_up_4: 'assets/animations/walking_up_4.png',
  walking_up_5: 'assets/animations/walking_up_5.png',
  walking_up_6: 'assets/animations/walking_up_6.png',
  walking_up_7: 'assets/animations/walking_up_7.png',
  walking_up_8: 'assets/animations/walking_up_8.png',

  // Bobby Walk Right (8 frames)
  walking_right_1: 'assets/animations/walking_right_1.png',
  walking_right_2: 'assets/animations/walking_right_2.png',
  walking_right_3: 'assets/animations/walking_right_3.png',
  walking_right_4: 'assets/animations/walking_right_4.png',
  walking_right_5: 'assets/animations/walking_right_5.png',
  walking_right_6: 'assets/animations/walking_right_6.png',
  walking_right_7: 'assets/animations/walking_right_7.png',
  walking_right_8: 'assets/animations/walking_right_8.png',

  // Bobby Fading Level Exit (9 frames)
  fading_1: 'assets/animations/fading_1.png',
  fading_2: 'assets/animations/fading_2.png',
  fading_3: 'assets/animations/fading_3.png',
  fading_4: 'assets/animations/fading_4.png',
  fading_5: 'assets/animations/fading_5.png',
  fading_6: 'assets/animations/fading_6.png',
  fading_7: 'assets/animations/fading_7.png',
  fading_8: 'assets/animations/fading_8.png',
  fading_9: 'assets/animations/fading_9.png',

  // Bobby Dying (8 frames)
  dying_1: 'assets/animations/dying_1.png',
  dying_2: 'assets/animations/dying_2.png',
  dying_3: 'assets/animations/dying_3.png',
  dying_4: 'assets/animations/dying_4.png',
  dying_5: 'assets/animations/dying_5.png',
  dying_6: 'assets/animations/dying_6.png',
  dying_7: 'assets/animations/dying_7.png',
  dying_8: 'assets/animations/dying_8.png',
};

class SpriteManager {
  constructor() {
    this.images = {};
    this.loaded = false;
    this.loadProgress = 0;
  }

  async loadAll(onProgress) {
    const keys = Object.keys(SPRITE_PATHS);
    let loadedCount = 0;
    const promises = keys.map((key) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = SPRITE_PATHS[key];
        img.onload = () => {
          this.images[key] = img;
          loadedCount++;
          if (onProgress) onProgress(loadedCount / keys.length);
          resolve();
        };
        img.onerror = (e) => {
          console.error(`Failed to load sprite: ${key} at ${SPRITE_PATHS[key]}`, e);
          // Don't reject entire load if one asset has minor issue
          resolve();
        };
      });
    });

    await Promise.all(promises);
    this.loaded = true;
  }

  get(key) {
    return this.images[key] || null;
  }

  /**
   * Auto-tiler for grass and fences according to surrounding neighbors
   * Exact logic from game.odin
   */
  getGrassTile(x, y, getTile) {
    const left = getTile(x - 1, y) !== 'Grass';
    const right = getTile(x + 1, y) !== 'Grass';
    const up = getTile(x, y - 1) !== 'Grass';
    const down = getTile(x, y + 1) !== 'Grass';

    if (down && up && right && left) return this.get('grass_down_up_right_left');
    if (down && up) return this.get('grass_down_up');
    if (right && left) return this.get('grass_right_left');
    if (right && down) return this.get('grass_right_down');
    if (left && down) return this.get('grass_left_down');
    if (left && up) return this.get('grass_left_up');
    if (right && up) return this.get('grass_right_up');
    if (right) return this.get('grass_right');
    if (left) return this.get('grass_left');
    if (down) return this.get('grass_down');
    if (up) return this.get('grass_up');
    return this.get('grass');
  }

  getFenceTile(x, y, getTile) {
    const left = getTile(x - 1, y) === 'Fence';
    const right = getTile(x + 1, y) === 'Fence';
    const down = getTile(x, y + 1) === 'Fence';

    if (right && left && down) return this.get('fence_right_left');
    if (right && left) return this.get('fence_right_left');
    if (right && down) return this.get('fence_right_down');
    if (left && down) return this.get('fence_left_down');
    if (right) return this.get('fence_right');
    if (left) return this.get('fence_left');
    if (down) return this.get('fence_down');
    return this.get('fence_down');
  }

  getBeltTile(tileName, frame) {
    const f = (frame % 4) + 1;
    switch (tileName) {
      case 'Belt_Right': return this.get(`belt_right_${f}`);
      case 'Belt_Left': return this.get(`belt_left_${f}`);
      case 'Belt_Up': return this.get(`belt_up_${f}`);
      case 'Belt_Down': return this.get(`belt_down_${f}`);
      default: return this.get('ground');
    }
  }

  getEndTile(canEnd, frame) {
    if (!canEnd) return this.get('end_1');
    const f = (frame % 4) + 1;
    return this.get(`end_${f}`);
  }
}

// --- 4. GAME ENGINE ---
// Bobby Carrot Remastered - Core Game Engine

const TILES_W = 16;
const TILES_H = 12;
const TILE_SIZE = 16;
const BUFFER_W = TILES_W * TILE_SIZE; // 256
const BUFFER_H = TILES_H * TILE_SIZE; // 192

const WALL_SWITCH = {
  Wall_Left_Right: 'Wall_Up_Down',
  Wall_Up_Down: 'Wall_Left_Right',
  Wall_Right_Up: 'Wall_Right_Down',
  Wall_Left_Down: 'Wall_Left_Up',
  Wall_Right_Down: 'Wall_Left_Down',
  Wall_Left_Up: 'Wall_Right_Up',
};

const BELT_SWITCH = {
  Belt_Left: 'Belt_Right',
  Belt_Right: 'Belt_Left',
  Belt_Up: 'Belt_Down',
  Belt_Down: 'Belt_Up',
};

class ProceduralGenerator {
  constructor(difficulty = 'normal') {
    this.difficulty = difficulty;
  }

  generate() {
    for (let attempt = 0; attempt < 50; attempt++) {
      const level = this.tryGenerate();
      if (level && this.validateSolvability(level) && this.validateConnectivity(level)) {
        return level;
      }
    }
    return this.fallbackLevel();
  }

  tryGenerate() {
    if (this.difficulty === 'easy') return this.generateEasy();
    if (this.difficulty === 'hard') return this.generateHard();
    return this.generateNormal();
  }

  // --- HARD MODE: 15x11 Full Screen Puzzle ---
  generateHard() {
    return this.generatePuzzle('hard');
    /* Legacy generator retained below as a reference for the original prototype. */
    const variant = Math.floor(Math.random() * 2);
    if (variant === 0) return this.generateHard2x2();
    return this.generateHardSerpentine();
  }

  // 15x11 grid with 4 rooms in a 2x2 grid (TL -> TR -> BR -> BL)
  generateHard2x2() {
    const W = 15;
    const H = 11;
    const grid = Array.from({ length: H }, () => Array(W).fill('.'));

    // Perimeter & dividing fences
    for (let x = 1; x < W - 1; x++) {
      grid[1][x] = '=';
      grid[5][x] = '=';
      grid[9][x] = '=';
    }
    for (let y = 1; y < H - 1; y++) {
      grid[y][1] = '=';
      grid[y][7] = '=';
      grid[y][13] = '=';
    }

    // Room boundaries
    const R1 = { x1: 2, y1: 2, x2: 6, y2: 4 }; // Top-Left
    const R2 = { x1: 8, y1: 2, x2: 12, y2: 4 }; // Top-Right
    const R3 = { x1: 8, y1: 6, x2: 12, y2: 8 }; // Bottom-Right
    const R4 = { x1: 2, y1: 6, x2: 6, y2: 8 }; // Bottom-Left

    const fillGround = (r) => {
      for (let y = r.y1; y <= r.y2; y++) {
        for (let x = r.x1; x <= r.x2; x++) grid[y][x] = ' ';
      }
    };
    fillGround(R1);
    fillGround(R2);
    fillGround(R3);
    fillGround(R4);

    // Doorway 1: R1 -> R2 (x=7, random y in 2..4)
    const d1Y = 2 + Math.floor(Math.random() * 3);
    grid[d1Y][7] = 'x';

    // Doorway 2: R2 -> R3 (y=5, random x in 8..12)
    const d2X = 8 + Math.floor(Math.random() * 5);
    grid[5][d2X] = 'x';

    // Doorway 3: R3 -> R4 (x=7, random y in 6..8)
    const d3Y = 6 + Math.floor(Math.random() * 3);
    grid[d3Y][7] = 'x';

    // Internal obstacles that leave rooms connected
    const placeObstacle = (r) => {
      const style = Math.floor(Math.random() * 3);
      if (style === 0) {
        // Horizontal bar
        grid[r.y1 + 1][r.x1 + 1] = '=';
        grid[r.y1 + 1][r.x1 + 2] = '=';
        grid[r.y1 + 1][r.x1 + 3] = '=';
      } else if (style === 1) {
        // Single central pillar
        grid[r.y1 + 1][r.x1 + 2] = '=';
      } else {
        // Twin pillars
        grid[r.y1 + 1][r.x1 + 1] = '=';
        grid[r.y1 + 1][r.x1 + 3] = '=';
      }
    };

    placeObstacle(R1);
    placeObstacle(R2);
    placeObstacle(R3);
    // In R4, central pillar
    grid[R4.y1 + 1][R4.x1 + 2] = '=';

    const getGround = (r) => {
      const cells = [];
      for (let y = r.y1; y <= r.y2; y++) {
        for (let x = r.x1; x <= r.x2; x++) {
          if (grid[y][x] === ' ') cells.push({ x, y });
        }
      }
      return cells;
    };

    // R1: Start and Silver Key
    grid[2][2] = '@';
    const r1Cells = getGround(R1).filter(p => !(p.x === 2 && p.y === 2));
    r1Cells.sort((a, b) => (Math.abs(b.x - 2) + Math.abs(b.y - 2)) - (Math.abs(a.x - 2) + Math.abs(a.y - 2)));
    if (r1Cells.length > 0) {
      grid[r1Cells[0].y][r1Cells[0].x] = 's';
    }

    // R2: Silver Lock (at entrance from R1) and Copper Key
    grid[d1Y][8] = 'S';
    const r2Cells = getGround(R2).filter(p => !(p.x === 8 && p.y === d1Y));
    r2Cells.sort(() => Math.random() - 0.5);
    if (r2Cells.length > 0) {
      grid[r2Cells[0].y][r2Cells[0].x] = 'c';
    }

    // R4: Copper Lock and Exit 'o' in an alcove (guarded by lock)
    grid[7][2] = 'C';
    grid[8][2] = 'o';
    grid[8][3] = '='; // Blocks side entry so Bobby MUST pass through C!

    // Carrots: 3-4 per room -> total 14-15 carrots
    const addCarrots = (r, count) => {
      const available = getGround(r);
      available.sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(count, available.length); i++) {
        grid[available[i].y][available[i].x] = '*';
      }
    };

    addCarrots(R1, 4);
    addCarrots(R2, 4);
    addCarrots(R3, 4);
    addCarrots(R4, 3);

    return grid.map(row => row.join(''));
  }

  // Serpentine Hard mode (3 large winding corridors)
  generateHardSerpentine() {
    const W = 15;
    const H = 11;
    const grid = Array.from({ length: H }, () => Array(W).fill('.'));

    for (let x = 1; x < W - 1; x++) {
      grid[1][x] = '=';
      grid[9][x] = '=';
    }
    for (let y = 1; y < H - 1; y++) {
      grid[y][1] = '=';
      grid[y][13] = '=';
    }

    // Horizontal fences separating corridors
    for (let x = 1; x < W - 1; x++) grid[4][x] = '=';
    for (let x = 1; x < W - 1; x++) grid[7][x] = '=';

    // Ground corridors
    for (let y = 2; y <= 3; y++) for (let x = 2; x <= 12; x++) grid[y][x] = ' ';
    for (let y = 5; y <= 6; y++) for (let x = 2; x <= 12; x++) grid[y][x] = ' ';
    for (let y = 8; y <= 8; y++) for (let x = 2; x <= 12; x++) grid[y][x] = ' ';

    grid[4][11] = 'x'; // Trap 1 (top to mid)
    grid[7][3] = 'x';  // Trap 2 (mid to bot)

    // Vertical baffles forcing zigzag (only 1 fence per column, NEVER block both rows!)
    grid[2][6] = '='; // row 2 fence, row 3 is open ground underneath
    grid[3][9] = '='; // row 3 fence, row 2 is open ground overhead
    grid[5][8] = '='; // row 5 fence, row 6 is open ground underneath
    grid[6][5] = '='; // row 6 fence, row 5 is open ground overhead

    grid[2][2] = '@';
    grid[3][5] = 's';  // Silver Key
    grid[5][11] = 'S'; // Silver Lock
    grid[6][2] = 'c';  // Copper Key
    grid[8][8] = 'C';  // Copper Lock
    grid[8][12] = 'o'; // Exit

    // 14 carrots
    const ground = [];
    for (let y = 2; y <= 8; y++) {
      for (let x = 2; x <= 12; x++) {
        if (grid[y][x] === ' ') ground.push({ x, y });
      }
    }
    ground.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(14, ground.length); i++) {
      grid[ground[i].y][ground[i].x] = '*';
    }

    return grid.map(row => row.join(''));
  }

  // --- NORMAL MODE: 13x11 Grid, 2 Sections + Dividing Wall + Keys ---
  generateNormal() {
    return this.generatePuzzle('normal');
    /* Legacy generator retained below as a reference for the original prototype. */
    const W = 13;
    const H = 11;
    const grid = Array.from({ length: H }, () => Array(W).fill('.'));

    for (let x = 1; x < W - 1; x++) {
      grid[1][x] = '=';
      grid[9][x] = '=';
    }
    for (let y = 1; y < H - 1; y++) {
      grid[y][1] = '=';
      grid[y][11] = '=';
    }
    // Vertical divider down middle
    for (let y = 1; y <= 9; y++) grid[y][6] = '=';

    // Left and right rooms
    for (let y = 2; y <= 8; y++) {
      for (let x = 2; x <= 5; x++) grid[y][x] = ' ';
      for (let x = 7; x <= 10; x++) grid[y][x] = ' ';
    }

    // Doorway 1: Left -> Right at y=3
    grid[3][6] = 'x';
    // Doorway 2: Right -> Left at y=7
    grid[7][6] = 'x';

    // Horizontal barrier dividing Left room so Top-Left cannot walk directly to Bottom-Left!
    for (let x = 2; x <= 5; x++) grid[5][x] = '=';

    // Baffle in Right room
    grid[5][8] = '='; grid[5][9] = '=';

    grid[2][2] = '@';  // Start in Top-Left
    grid[2][10] = 's'; // Silver Key in Right Room
    grid[7][2] = 'S';  // Silver Lock in Bottom-Left
    grid[8][2] = 'o';  // Exit in Bottom-Left
    grid[8][3] = '=';  // Forces entry through S

    const ground = [];
    for (let y = 2; y <= 8; y++) {
      for (let x = 2; x <= 10; x++) {
        if (grid[y][x] === ' ') ground.push({ x, y });
      }
    }
    ground.sort(() => Math.random() - 0.5);
    const count = 10;
    for (let i = 0; i < Math.min(count, ground.length); i++) {
      grid[ground[i].y][ground[i].x] = '*';
    }

    return grid.map(row => row.join(''));
  }

  // --- EASY MODE: 11x9 Grid, 2 Rooms + Dividing Trap ---
  generateEasy() {
    return this.generatePuzzle('easy');
    /* Legacy generator retained below as a reference for the original prototype. */
    const W = 11;
    const H = 9;
    const grid = Array.from({ length: H }, () => Array(W).fill('.'));

    for (let x = 1; x < W - 1; x++) {
      grid[1][x] = '=';
      grid[7][x] = '=';
    }
    for (let y = 1; y < H - 1; y++) {
      grid[y][1] = '=';
      grid[y][9] = '=';
    }
    // Divider
    for (let y = 1; y <= 7; y++) grid[y][5] = '=';

    for (let y = 2; y <= 6; y++) {
      for (let x = 2; x <= 4; x++) grid[y][x] = ' ';
      for (let x = 6; x <= 8; x++) grid[y][x] = ' ';
    }

    grid[4][5] = 'x'; // Doorway trap

    // Central pillars
    grid[4][3] = '=';
    grid[4][7] = '=';

    grid[2][2] = '@';
    grid[6][8] = 'o';

    const ground = [];
    for (let y = 2; y <= 6; y++) {
      for (let x = 2; x <= 8; x++) {
        if (grid[y][x] === ' ') ground.push({ x, y });
      }
    }
    ground.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(6, ground.length); i++) {
      grid[ground[i].y][ground[i].x] = '*';
    }

    return grid.map(row => row.join(''));
  }

  // Procedural levels use a winding two-cell route, gated keys, visible decoy
  // traps and real collection density. The old generator produced broad rooms
  // with too many equivalent routes, so almost every random walk succeeded.
  generatePuzzle(difficulty) {
    const specs = {
      easy:   { w: 13, h: 11, bands: [{ top: 2, bottom: 3 }, { top: 5, bottom: 6 }, { top: 8, bottom: 8 }], carrots: 14, locks: 0, traps: 1, obstacles: 2 },
      normal: { w: 15, h: 11, bands: [{ top: 2, bottom: 3 }, { top: 5, bottom: 6 }, { top: 8, bottom: 9 }], carrots: 22, locks: 1, traps: 3, obstacles: 6 },
      hard:   { w: 16, h: 12, bands: [{ top: 1, bottom: 2 }, { top: 4, bottom: 5 }, { top: 7, bottom: 8 }, { top: 10, bottom: 10 }], carrots: 30, locks: 2, traps: 6, obstacles: 11 },
    };
    const spec = specs[difficulty] || specs.normal;
    const W = spec.w;
    const H = spec.h;
    const grid = Array.from({ length: H }, () => Array(W).fill('.'));
    const shuffle = (items) => {
      const result = items.slice();
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    };
    const bandCells = (band) => {
      const cells = [];
      for (let y = band.top; y <= band.bottom; y++) {
        for (let x = 2; x <= W - 3; x++) cells.push({ x, y });
      }
      return cells;
    };
    const openInBand = (band, reserved = new Set()) => shuffle(bandCells(band).filter(({ x, y }) => grid[y][x] === ' ' && !reserved.has(`${x},${y}`)));

    // Carve horizontal chambers. The grass outside these bands remains an
    // impassable boundary, while the separators become the decision points.
    for (const band of spec.bands) {
      for (let y = band.top; y <= band.bottom; y++) {
        for (let x = 2; x <= W - 3; x++) grid[y][x] = ' ';
      }
    }

    const connectors = [];
    for (let i = 0; i < spec.bands.length - 1; i++) {
      const upper = spec.bands[i];
      const lower = spec.bands[i + 1];
      const separator = Math.floor((upper.bottom + lower.top) / 2);
      for (let x = 1; x < W - 1; x++) grid[separator][x] = '=';

      const edge = i % 2 === 0 ? W - 3 : 2;
      const jitter = Math.floor(Math.random() * Math.min(3, Math.max(1, W - 8)));
      const connector = i % 2 === 0 ? Math.max(2, edge - jitter) : Math.min(W - 3, edge + jitter);
      grid[separator][connector] = ' ';

      // A second opening is deliberately a lethal decoy. It makes each
      // transition a visual choice instead of a corridor with no consequence.
      const decoy = connector < Math.floor(W / 2) ? connector + 2 : connector - 2;
      if (decoy !== connector && decoy >= 2 && decoy <= W - 3) grid[separator][decoy] = 'X';
      connectors.push({ separator, connector });
    }

    // Staggered pillars force the player to switch between the two lanes.
    for (let bandIndex = 0; bandIndex < spec.bands.length; bandIndex++) {
      const band = spec.bands[bandIndex];
      const rows = band.top === band.bottom ? [band.top] : [band.top, band.bottom];
      const count = Math.min(spec.obstacles, Math.max(0, rows.length === 1 ? 0 : 2 + bandIndex));
      for (let i = 0; i < count; i++) {
        const row = rows[(i + bandIndex) % rows.length];
        const x = 3 + ((bandIndex * 5 + i * 3 + Math.floor(Math.random() * 2)) % Math.max(1, W - 6));
        const otherRow = rows.find((candidate) => candidate !== row);
        // Never block both lanes at the same column; the other lane is the
        // intended bypass and keeps the level solvable.
        if (grid[row][x] === ' ' && (!otherRow || grid[otherRow][x] === ' ')) grid[row][x] = '=';
      }
    }

    const reserved = new Set();
    const place = (bandIndex, tile, preferredX) => {
      const band = spec.bands[Math.max(0, Math.min(spec.bands.length - 1, bandIndex))];
      const cells = openInBand(band, reserved).sort((a, b) => Math.abs(a.x - preferredX) - Math.abs(b.x - preferredX));
      const cell = cells[0];
      if (!cell) return null;
      grid[cell.y][cell.x] = tile;
      reserved.add(`${cell.x},${cell.y}`);
      return cell;
    };

    const start = { x: 2, y: spec.bands[0].top };
    grid[start.y][start.x] = '@';
    reserved.add(`${start.x},${start.y}`);
    const exitBand = spec.bands[spec.bands.length - 1];
    const exit = { x: W - 3, y: exitBand.bottom };
    if (grid[exit.y][exit.x] !== ' ') {
      const fallbackExit = openInBand(exitBand, reserved)[0];
      if (fallbackExit) { exit.x = fallbackExit.x; exit.y = fallbackExit.y; }
    }
    grid[exit.y][exit.x] = 'o';
    reserved.add(`${exit.x},${exit.y}`);

    // Keys are placed before their corresponding locks in the route. The
    // actual lock remains a meaningful gate because canMove checks inventory.
    const keyTiles = ['s', 'c', 'g'];
    const lockTiles = ['S', 'C', 'G'];
    for (let i = 0; i < spec.locks && i < connectors.length; i++) {
      place(i, keyTiles[i], i % 2 === 0 ? W - 4 : 3);
      const gate = connectors[i];
      if (grid[gate.separator][gate.connector] === ' ') grid[gate.separator][gate.connector] = lockTiles[i];
    }

    // Add harmless-looking but irreversible trap tiles away from the required
    // gates. The X decoys above are immediate failures; x tiles punish careless
    // backtracking after the player leaves them.
    let extraTraps = Math.max(0, spec.traps - connectors.length);
    for (const band of shuffle(spec.bands)) {
      for (const cell of openInBand(band, reserved)) {
        if (extraTraps <= 0) break;
        grid[cell.y][cell.x] = 'x';
        reserved.add(`${cell.x},${cell.y}`);
        extraTraps--;
      }
      if (extraTraps <= 0) break;
    }

    // Populate the route densely, alternating carrots and egg spots so the
    // procedural mode teaches both objectives instead of only one campaign.
    let collectibleIndex = 0;
    const collectibles = [];
    for (const band of shuffle(spec.bands)) collectibles.push(...openInBand(band, reserved));
    for (const cell of collectibles.slice(0, spec.carrots)) {
      grid[cell.y][cell.x] = collectibleIndex % (difficulty === 'hard' ? 4 : 5) === 0 ? 'e' : '*';
      collectibleIndex++;
    }

    return grid.map((row) => row.join(''));
  }

  validateSolvability(grid) {
    let start = null, exit = null;
    let carrots = 0;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const c = grid[y][x];
        if (c === '@') start = { x, y };
        else if (c === 'o') exit = { x, y };
        else if (c === '*' || c === 'e') carrots++;
      }
    }
    if (!start || !exit) return false;
    if (this.difficulty === 'easy' && carrots < 5) return false;
    if (this.difficulty === 'normal' && carrots < 8) return false;
    if (this.difficulty === 'hard' && carrots < 12) return false;

    // Start and exit must not be directly adjacent
    const dist = Math.abs(start.x - exit.x) + Math.abs(start.y - exit.y);
    return dist >= 4;
  }

  // Guarantees 100% that no fence isolates any carrot, key, lock, trap, or the exit.
  validateConnectivity(grid) {
    const H = grid.length;
    const W = grid[0].length;
    let start = null;
    let totalItems = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c === '@') start = { x, y };
        else if (c === '*' || c === 'e' || c === 's' || c === 'c' || c === 'g' || c === 'S' || c === 'C' || c === 'G' || c === 'x' || c === 'X' || c === 'o') {
          totalItems++;
        }
      }
    }
    if (!start) return false;

    const visited = new Set();
    const q = [start];
    visited.add(`${start.x},${start.y}`);
    let itemsReached = 0;

    const DIRS = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    while (q.length > 0) {
      const cur = q.shift();
      for (const d of DIRS) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;

        const tile = grid[ny][nx];
        // Cannot pass Grass ('.') or Fence ('=')
        if (tile === '.' || tile === '=') continue;

        visited.add(key);
        q.push({ x: nx, y: ny });

        if (tile === '*' || tile === 'e' || tile === 's' || tile === 'c' || tile === 'g' || tile === 'S' || tile === 'C' || tile === 'G' || tile === 'x' || tile === 'X' || tile === 'o') {
          itemsReached++;
        }
      }
    }

    return itemsReached === totalItems;
  }

  fallbackLevel() {
    return [
      ".........",
      "...   ...",
      ".   o   .",
      ". ===== .",
      ". =***= .",
      ". =***= .",
      ". =***= .",
      ". == == .",
      ".       .",
      ".   @   .",
      "...   ...",
      "........."
    ];
  }
}

class BobbyGame {
  constructor(sprites) {
    this.sprites = sprites;
    this.campaign = 'Carrot_Harvest'; // or 'Easter_Eggs' or 'Procedural'
    this.proceduralDifficulty = 'normal'; // 'easy', 'normal', 'hard'
    this.proceduralLevel = null; // current generated level grid
    this.proceduralLevelNumber = 1;
    this.levelIndex = 0;

    // Save Data
    this.saveData = this.loadSaveData();

    // Game loop timing
    this.lastTime = performance.now();
    this.accumulatedTime = 0;
    this.tps = 30;
    this.tickMs = 1000 / this.tps;

    // Animation frame counters
    this.tileAnimFrame = 0;
    this.tileAnimTimer = 0;

    this.idleTimer = 0;
    this.idleFrame = 0;

    // Level State
    this.level = null;
    this.player = null;
    this.state = 'MENU'; // 'MENU', 'PLAYING', 'LEVEL_COMPLETE', 'DYING', 'DEAD', 'GAME_OVER'

    // Input buffer
    this.queuedDirection = null;

    // Callbacks
    this.onStateChange = null;
    this.onHUDUpdate = null;
  }

  loadSaveData() {
    try {
      const saved = localStorage.getItem('bobby_carrot_save');
      if (saved) {
        const data = JSON.parse(saved);
        if (!data.unlocked) data.unlocked = {};
        if (!data.scores) data.scores = {};
        data.unlocked.Carrot_Harvest = data.unlocked.Carrot_Harvest || 0;
        data.unlocked.Easter_Eggs = data.unlocked.Easter_Eggs || 0;
        data.unlocked.Procedural = data.unlocked.Procedural || 0;
        data.scores.Carrot_Harvest = data.scores.Carrot_Harvest || {};
        data.scores.Easter_Eggs = data.scores.Easter_Eggs || {};
        data.scores.Procedural = data.scores.Procedural || {};
        return data;
      }
    } catch (e) {
      console.warn('Could not load localStorage', e);
    }
    return {
      unlocked: {
        Carrot_Harvest: 0,
        Easter_Eggs: 0,
        Procedural: 0,
      },
      scores: {
        Carrot_Harvest: {},
        Easter_Eggs: {},
        Procedural: {},
      },
    };
  }

  saveGame() {
    try {
      localStorage.setItem('bobby_carrot_save', JSON.stringify(this.saveData));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  }

  getLevelList() {
    if (this.campaign === 'Procedural') {
      return this.proceduralLevel ? [this.proceduralLevel] : [];
    }
    return this.campaign === 'Carrot_Harvest' ? CARROT_LEVELS : EGG_LEVELS;
  }

  startProceduralLevel(difficulty, isNext = false) {
    this.campaign = 'Procedural';
    this.proceduralDifficulty = difficulty || this.proceduralDifficulty;
    this.proceduralLevelNumber = isNext ? ((this.proceduralLevelNumber || 0) + 1) : 1;
    const gen = new ProceduralGenerator(this.proceduralDifficulty);
    this.proceduralLevel = gen.generate();
    this.levelIndex = 0;
    this.startLevel(0);
  }

  startLevel(index) {
    const list = this.getLevelList();
    if (index < 0) index = 0;
    if (index >= list.length) index = list.length - 1;
    this.levelIndex = index;

    const rawGrid = list[index];
    const height = rawGrid.length;
    const width = rawGrid[0].length;

    const tiles = [];
    let startX = 1, startY = 1;
    let carrotCount = 0;
    let eggCount = 0;

    for (let y = 0; y < height; y++) {
      const row = [];
      const line = rawGrid[y];
      for (let x = 0; x < width; x++) {
        const ch = line[x] || '.';
        const tileType = TILE_CHARS[ch] || 'Ground';
        row.push(tileType);

        if (tileType === 'Start') {
          startX = x;
          startY = y;
        } else if (tileType === 'Carrot') {
          carrotCount++;
        } else if (tileType === 'Egg_Spot') {
          eggCount++;
        }
      }
      tiles.push(row);
    }

    this.level = {
      width,
      height,
      tiles,
      carrots: carrotCount,
      eggs: eggCount,
      canEnd: (carrotCount === 0 && eggCount === 0),
      time: 0,
      steps: 0,
      bannerTimer: 2.0, // Shows "Level X" for 2 seconds
    };

    this.player = {
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      targetX: startX,
      targetY: startY,
      direction: 'Down',
      isMoving: false,
      moveProgress: 0, // 0 to 1
      moveSpeed: 6.2,  // tiles per second (~0.16s per tile)
      silverKey: false,
      goldenKey: false,
      copperKey: false,
      onBelt: false,
      fadingTimer: 0,
      dyingTimer: 0,
      dyingFrame: 0,
    };

    this.state = 'PLAYING';
    this.queuedDirection = null;
    this.idleTimer = 0;
    this.idleFrame = 0;

    if (this.onStateChange) this.onStateChange(this.state);
  }

  restartLevel() {
    this.startLevel(this.levelIndex);
  }

  nextLevel() {
    if (this.campaign === 'Procedural') {
      this.startProceduralLevel(this.proceduralDifficulty, true);
      return;
    }
    const list = this.getLevelList();
    if (this.levelIndex + 1 < list.length) {
      this.startLevel(this.levelIndex + 1);
    } else {
      this.state = 'CAMPAIGN_COMPLETE';
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  getTile(x, y) {
    if (!this.level) return 'Grass';
    if (x < 0 || x >= this.level.width || y < 0 || y >= this.level.height) {
      return 'Grass';
    }
    return this.level.tiles[y][x];
  }

  setTile(x, y, tile) {
    if (!this.level) return;
    if (x >= 0 && x < this.level.width && y >= 0 && y < this.level.height) {
      this.level.tiles[y][x] = tile;
    }
  }

  canMove(x, y, dir) {
    let nx = x;
    let ny = y;
    if (dir === 'Right') nx++;
    else if (dir === 'Left') nx--;
    else if (dir === 'Down') ny++;
    else if (dir === 'Up') ny--;

    if (nx < 0 || nx >= this.level.width || ny < 0 || ny >= this.level.height) {
      return false;
    }

    const currentTile = this.getTile(x, y);
    const targetTile = this.getTile(nx, ny);

    // Obstacles
    if (targetTile === 'Grass' || targetTile === 'Fence' || targetTile === 'Egg') {
      return false;
    }

    // Key / Lock check
    if (targetTile === 'Silver_Lock' && !this.player.silverKey) return false;
    if (targetTile === 'Golden_Lock' && !this.player.goldenKey) return false;
    if (targetTile === 'Copper_Lock' && !this.player.copperKey) return false;

    // Entering Turnstile walls check
    if (targetTile === 'Wall_Left_Right' && dir !== 'Up' && dir !== 'Down') return false;
    if (targetTile === 'Wall_Up_Down' && dir !== 'Left' && dir !== 'Right') return false;
    if (targetTile === 'Wall_Right_Up' && dir !== 'Right' && dir !== 'Up') return false;
    if (targetTile === 'Wall_Right_Down' && dir !== 'Right' && dir !== 'Down') return false;
    if (targetTile === 'Wall_Left_Up' && dir !== 'Left' && dir !== 'Up') return false;
    if (targetTile === 'Wall_Left_Down' && dir !== 'Left' && dir !== 'Down') return false;

    // Leaving Turnstile walls check
    if (currentTile === 'Wall_Left_Right' && (dir === 'Left' || dir === 'Right')) return false;
    if (currentTile === 'Wall_Up_Down' && (dir === 'Up' || dir === 'Down')) return false;
    if (currentTile === 'Wall_Right_Up' && (dir === 'Right' || dir === 'Up')) return false;
    if (currentTile === 'Wall_Right_Down' && (dir === 'Right' || dir === 'Down')) return false;
    if (currentTile === 'Wall_Left_Up' && (dir === 'Left' || dir === 'Up')) return false;
    if (currentTile === 'Wall_Left_Down' && (dir === 'Left' || dir === 'Down')) return false;

    // Belt checks: Cannot walk against belt direction
    if (targetTile === 'Belt_Left' && dir === 'Right') return false;
    if (targetTile === 'Belt_Right' && dir === 'Left') return false;
    if (targetTile === 'Belt_Up' && dir === 'Down') return false;
    if (targetTile === 'Belt_Down' && dir === 'Up') return false;

    // If currently on belt, cannot move via player input (belt carries you)
    if (this.player.onBelt && !this.isBeltTile(targetTile)) {
      // unless belt pushes you off
    }

    return true;
  }

  isBeltTile(tile) {
    return tile === 'Belt_Left' || tile === 'Belt_Right' || tile === 'Belt_Up' || tile === 'Belt_Down';
  }

  isWallTile(tile) {
    return tile && tile.startsWith('Wall_');
  }

  pressRedButton() {
    audio.playButton();
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const t = this.level.tiles[y][x];
        if (t === 'Red_Button') {
          this.level.tiles[y][x] = 'Red_Button_Pressed';
        } else if (t === 'Red_Button_Pressed') {
          this.level.tiles[y][x] = 'Red_Button';
        } else if (this.isWallTile(t)) {
          this.level.tiles[y][x] = WALL_SWITCH[t] || t;
        }
      }
    }
  }

  pressYellowButton() {
    audio.playButton();
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const t = this.level.tiles[y][x];
        if (t === 'Yellow_Button') {
          this.level.tiles[y][x] = 'Yellow_Button_Pressed';
        } else if (t === 'Yellow_Button_Pressed') {
          this.level.tiles[y][x] = 'Yellow_Button';
        } else if (this.isBeltTile(t)) {
          this.level.tiles[y][x] = BELT_SWITCH[t] || t;
        }
      }
    }
  }

  queueInput(direction) {
    if (this.state !== 'PLAYING') return;
    this.queuedDirection = direction;
  }

  triggerMove(dir, byBelt = false) {
    if (!this.canMove(this.player.x, this.player.y, dir)) {
      // Just change facing direction if not moving
      this.player.direction = dir;
      return false;
    }

    this.player.direction = dir;
    this.player.prevX = this.player.x;
    this.player.prevY = this.player.y;

    if (dir === 'Right') this.player.targetX = this.player.x + 1;
    else if (dir === 'Left') this.player.targetX = this.player.x - 1;
    else if (dir === 'Down') this.player.targetY = this.player.y + 1;
    else if (dir === 'Up') this.player.targetY = this.player.y - 1;

    this.player.isMoving = true;
    this.player.moveProgress = 0;

    if (!byBelt) {
      this.level.steps++;
      audio.playStep();
    } else {
      audio.playBelt();
    }

    return true;
  }

  onTileStepComplete() {
    const origX = this.player.prevX;
    const origY = this.player.prevY;
    const newX = this.player.targetX;
    const newY = this.player.targetY;

    this.player.x = newX;
    this.player.y = newY;
    this.player.isMoving = false;
    this.player.moveProgress = 0;

    const originalTile = this.getTile(origX, origY);
    const currentTile = this.getTile(newX, newY);

    // Tile left behind effects
    if (originalTile === 'Trap') {
      this.setTile(origX, origY, 'Trap_Activated');
    } else if (originalTile === 'Egg_Spot') {
      this.setTile(origX, origY, 'Egg');
      this.level.eggs--;
      audio.playEgg();
    } else if (this.isWallTile(originalTile)) {
      // Turnstile wall rotates when walking through
      this.setTile(origX, origY, WALL_SWITCH[originalTile] || originalTile);
    }

    if (this.isBeltTile(originalTile) && !this.isBeltTile(currentTile)) {
      this.player.onBelt = false;
    }

    // New tile entered effects
    if (currentTile === 'Carrot') {
      this.setTile(newX, newY, 'Carrot_Hole');
      this.level.carrots--;
      audio.playCarrot();
    } else if (currentTile === 'Silver_Key') {
      this.setTile(newX, newY, 'Ground');
      this.player.silverKey = true;
      audio.playKey();
    } else if (currentTile === 'Silver_Lock') {
      this.setTile(newX, newY, 'Ground');
      this.player.silverKey = false;
      audio.playLock();
    } else if (currentTile === 'Golden_Key') {
      this.setTile(newX, newY, 'Ground');
      this.player.goldenKey = true;
      audio.playKey();
    } else if (currentTile === 'Golden_Lock') {
      this.setTile(newX, newY, 'Ground');
      this.player.goldenKey = false;
      audio.playLock();
    } else if (currentTile === 'Copper_Key') {
      this.setTile(newX, newY, 'Ground');
      this.player.copperKey = true;
      audio.playKey();
    } else if (currentTile === 'Copper_Lock') {
      this.setTile(newX, newY, 'Ground');
      this.player.copperKey = false;
      audio.playLock();
    } else if (currentTile === 'Red_Button') {
      this.pressRedButton();
    } else if (currentTile === 'Yellow_Button') {
      this.pressYellowButton();
    } else if (currentTile === 'Trap_Activated') {
      // Stepped onto triggered spikes: death!
      this.state = 'DYING';
      this.player.dyingTimer = 0;
      this.player.dyingFrame = 0;
      audio.playTrap();
      audio.playDeath();
      if (this.onStateChange) this.onStateChange(this.state);
      return;
    }

    // Check if level can now exit
    if (this.level.carrots === 0 && this.level.eggs === 0) {
      if (!this.level.canEnd) {
        this.level.canEnd = true;
      }
    }

    // Check End Portal reached
    if (currentTile === 'End') {
      if (this.level.canEnd) {
        this.state = 'FADING';
        this.player.fadingTimer = 0;
        audio.playLevelComplete();

        // Ensure safe save data structure
        if (!this.saveData.unlocked) this.saveData.unlocked = {};
        if (!this.saveData.scores) this.saveData.scores = {};
        if (typeof this.saveData.unlocked[this.campaign] !== 'number') this.saveData.unlocked[this.campaign] = 0;
        if (!this.saveData.scores[this.campaign]) this.saveData.scores[this.campaign] = {};

        const saveKey = this.campaign === 'Procedural' ? String(this.proceduralLevelNumber || 1) : String(this.levelIndex);

        // Unlock next level in save
        const nextIdx = this.levelIndex + 1;
        if (nextIdx > this.saveData.unlocked[this.campaign]) {
          this.saveData.unlocked[this.campaign] = nextIdx;
        }

        // Record best time and steps
        const currentBest = this.saveData.scores[this.campaign][saveKey] || { time: 9999999, steps: 999999 };
        if (this.level.time < currentBest.time || !currentBest.time) currentBest.time = this.level.time;
        if (this.level.steps < currentBest.steps || !currentBest.steps) currentBest.steps = this.level.steps;
        this.saveData.scores[this.campaign][saveKey] = currentBest;
        this.saveGame();

        if (this.onStateChange) this.onStateChange(this.state);
        return;
      } else {
        // Player stepped on exit but carrots remain
        if (this.onHUDToast) {
          this.onHUDToast('¡Recoge todas las zanahorias para abrir el portal!');
        }
      }
    }

    // If stepped on conveyor belt, activate belt mode
    if (this.isBeltTile(currentTile)) {
      this.player.onBelt = true;
    }
  }

  update(dt) {
    // Tile animation loop (conveyor belts, exit portals) ~ 4 frames per sec
    this.tileAnimTimer += dt;
    if (this.tileAnimTimer >= 0.15) {
      this.tileAnimTimer = 0;
      this.tileAnimFrame = (this.tileAnimFrame + 1) % 4;
    }

    if (this.state === 'DYING') {
      this.player.dyingTimer += dt;
      this.player.dyingFrame = Math.min(7, Math.floor(this.player.dyingTimer / 0.08));
      if (this.player.dyingTimer >= 0.8) {
        this.state = 'DEAD';
        if (this.onStateChange) this.onStateChange(this.state);
      }
      return;
    }

    if (this.state === 'FADING') {
      this.player.fadingTimer += dt;
      if (this.player.fadingTimer >= 0.6) {
        this.state = 'LEVEL_COMPLETE';
        if (this.onStateChange) this.onStateChange(this.state);
      }
      return;
    }

    if (this.state !== 'PLAYING') return;

    this.level.time += dt;
    if (this.level.bannerTimer > 0) {
      this.level.bannerTimer -= dt;
    }

    // Idle animation when standing still
    if (!this.player.isMoving) {
      this.idleTimer += dt;
      if (this.idleTimer >= 3.0) {
        this.idleFrame = Math.floor((this.idleTimer - 3.0) / 0.18) % 3;
      } else {
        this.idleFrame = 0;
      }
    } else {
      this.idleTimer = 0;
      this.idleFrame = 0;
    }

    // Player walking interpolation
    if (this.player.isMoving) {
      this.player.moveProgress += this.player.moveSpeed * dt;
      if (this.player.moveProgress >= 1.0) {
        this.onTileStepComplete();
      }
    }

    // Check next move if not moving
    if (!this.player.isMoving && this.state === 'PLAYING') {
      const currentTile = this.getTile(this.player.x, this.player.y);

      // Belt automatic movement priority
      if (this.isBeltTile(currentTile)) {
        let beltDir = 'Right';
        if (currentTile === 'Belt_Left') beltDir = 'Left';
        else if (currentTile === 'Belt_Up') beltDir = 'Up';
        else if (currentTile === 'Belt_Down') beltDir = 'Down';

        this.triggerMove(beltDir, true);
      } else if (this.queuedDirection) {
        const dir = this.queuedDirection;
        this.queuedDirection = null;
        this.triggerMove(dir, false);
      }
    }
  }

  // Camera & view calculations
  getCameraOffset() {
    if (!this.level || !this.player) return { x: 0, y: 0 };

    const diffX = TILES_W - this.level.width;
    const diffY = TILES_H - this.level.height;

    let playerRenderX = this.player.x;
    let playerRenderY = this.player.y;
    if (this.player.isMoving) {
      const p = Math.min(1, this.player.moveProgress);
      playerRenderX = this.player.prevX + (this.player.targetX - this.player.prevX) * p;
      playerRenderY = this.player.prevY + (this.player.targetY - this.player.prevY) * p;
    }

    let offsetX = 0;
    if (diffX > 0) {
      offsetX = diffX / 2;
    } else {
      const off = (TILES_W / 2) - (playerRenderX + 0.5);
      offsetX = Math.max(diffX, Math.min(0, off));
    }

    let offsetY = 0;
    if (diffY > 0) {
      offsetY = diffY / 2;
    } else {
      const off = (TILES_H / 2) - (playerRenderY + 0.5);
      offsetY = Math.max(diffY, Math.min(0, off));
    }

    return { x: offsetX, y: offsetY };
  }

  render(ctx) {
    if (!this.level) return;

    // Background grass fill
    const bgTile = this.campaign === 'Carrot_Harvest' ? this.sprites.get('grass') : this.sprites.get('ground');
    if (bgTile) {
      for (let gy = 0; gy < TILES_H; gy++) {
        for (let gx = 0; gx < TILES_W; gx++) {
          ctx.drawImage(bgTile, gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    const cam = this.getCameraOffset();
    const startPixelX = Math.round(cam.x * TILE_SIZE);
    const startPixelY = Math.round(cam.y * TILE_SIZE);

    // 1. Draw Map Tiles
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const destX = startPixelX + x * TILE_SIZE;
        const destY = startPixelY + y * TILE_SIZE;

        // Skip tiles outside 256x192 viewport
        if (destX < -TILE_SIZE || destX > BUFFER_W || destY < -TILE_SIZE || destY > BUFFER_H) {
          continue;
        }

        const tileType = this.level.tiles[y][x];

        // Draw ground base under buttons, keys, traps, eggs, holes, end
        if (tileType !== 'Grass' && tileType !== 'Fence') {
          const g = this.sprites.get('ground');
          if (g) ctx.drawImage(g, destX, destY, TILE_SIZE, TILE_SIZE);
        }

        let spriteImg = null;
        if (tileType === 'Grass') {
          spriteImg = this.sprites.getGrassTile(x, y, (tx, ty) => this.getTile(tx, ty));
        } else if (tileType === 'Fence') {
          spriteImg = this.sprites.getFenceTile(x, y, (tx, ty) => this.getTile(tx, ty));
        } else if (tileType === 'End') {
          spriteImg = this.sprites.getEndTile(this.level.canEnd, this.tileAnimFrame);
        } else if (this.isBeltTile(tileType)) {
          spriteImg = this.sprites.getBeltTile(tileType, this.tileAnimFrame);
        } else {
          // Standard tile
          const key = tileType.toLowerCase();
          spriteImg = this.sprites.get(key) || this.sprites.get('ground');
        }

        if (spriteImg) {
          ctx.drawImage(spriteImg, destX, destY, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // 2. Draw Player Bobby
    if (this.player && this.state !== 'LEVEL_COMPLETE') {
      let renderX = this.player.x;
      let renderY = this.player.y;
      if (this.player.isMoving) {
        const p = Math.min(1, this.player.moveProgress);
        renderX = this.player.prevX + (this.player.targetX - this.player.prevX) * p;
        renderY = this.player.prevY + (this.player.targetY - this.player.prevY) * p;
      }

      let playerSprite = null;
      let offsetX = -1;
      let offsetY = -9;

      if (this.state === 'DYING' || this.state === 'DEAD') {
        offsetX = -3;
        offsetY = -11;
        playerSprite = this.sprites.get(`dying_${this.player.dyingFrame + 1}`);
      } else if (this.state === 'FADING') {
        const f = Math.min(9, Math.floor(this.player.fadingTimer / 0.06) + 1);
        playerSprite = this.sprites.get(`fading_${f}`);
      } else if (this.player.isMoving) {
        const walkFrame = (Math.floor(this.player.moveProgress * 8) % 8) + 1;
        const dirStr = this.player.direction.toLowerCase();
        playerSprite = this.sprites.get(`walking_${dirStr}_${walkFrame}`);
      } else {
        // Idle
        playerSprite = this.sprites.get(`idle_${this.idleFrame + 1}`) || this.sprites.get('idle_1');
      }

      if (playerSprite) {
        const px = Math.round(startPixelX + renderX * TILE_SIZE + offsetX);
        const py = Math.round(startPixelY + renderY * TILE_SIZE + offsetY);
        ctx.drawImage(playerSprite, px, py);
      }
    }

    // 3. Draw HUD
    this.renderHUD(ctx);
  }

  renderHUD(ctx) {
    if (!this.level || this.state === 'LEVEL_COMPLETE') return;

    // Time text on top-left
    const totalSeconds = Math.floor(this.level.time);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    const timeStr = `${mm}:${ss}`;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // HUD numbers background shadow & text
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = '#000000';
    ctx.fillText(timeStr, 4, 11);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(timeStr, 3, 10);

    // Right side: Item icons & counters
    let rightX = BUFFER_W - 4;

    // Keys
    if (this.player.copperKey) {
      const k = this.sprites.get('hud_copper_key');
      if (k) { rightX -= 12; ctx.drawImage(k, rightX, 2); }
    }
    if (this.player.goldenKey) {
      const k = this.sprites.get('hud_golden_key');
      if (k) { rightX -= 12; ctx.drawImage(k, rightX, 2); }
    }
    if (this.player.silverKey) {
      const k = this.sprites.get('hud_silver_key');
      if (k) { rightX -= 12; ctx.drawImage(k, rightX, 2); }
    }

    // Carrots remaining
    if (this.level.carrots > 0) {
      const cIcon = this.sprites.get('hud_carrot');
      const cCount = String(this.level.carrots);
      rightX -= (cCount.length * 6 + 14);
      if (cIcon) ctx.drawImage(cIcon, rightX + cCount.length * 6 + 2, 2);
      ctx.fillStyle = '#000000';
      ctx.fillText(cCount, rightX + 1, 11);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(cCount, rightX, 10);
    }

    // Eggs remaining
    if (this.level.eggs > 0) {
      const eIcon = this.sprites.get('hud_egg');
      const eCount = String(this.level.eggs);
      rightX -= (eCount.length * 6 + 14);
      if (eIcon) ctx.drawImage(eIcon, rightX + eCount.length * 6 + 2, 2);
      ctx.fillStyle = '#000000';
      ctx.fillText(eCount, rightX + 1, 11);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(eCount, rightX, 10);
    }

    // Level Begin Banner: "LEVEL X" for first 2 seconds
    if (this.level.bannerTimer > 0) {
      const bannerText = this.campaign === 'Procedural' ? `LEVEL ${this.proceduralLevelNumber || 1}` : `LEVEL ${this.levelIndex + 1}`;
      ctx.font = 'bold 12px "Courier New", monospace';
      const tw = ctx.measureText(bannerText).width;
      const bx = Math.round((BUFFER_W - tw) / 2);
      const by = Math.round(BUFFER_H / 2);

      // Semi-transparent backdrop pill
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bx - 8, by - 14, tw + 16, 20);

      ctx.fillStyle = '#FFD700';
      ctx.fillText(bannerText, bx, by);
    }

    ctx.restore();
  }
}
window.BobbyGame = BobbyGame;

// --- 5. POST-PROCESSING & GRAPHICS RENDERER (xBR-lv2 & CLASSIC) ---
class PostProcessingRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const urlParamMode = new URLSearchParams(window.location.search).get("mode");
    this.mode = urlParamMode ? (urlParamMode.toUpperCase() === "CLASSIC" ? "CLASSIC" : "HD_XBR") : (localStorage.getItem("bobby_render_mode") || "HD_XBR");
    this.isWebGL = false;
    this.gl = null;
    this.programClassic = null;
    this.programXbr = null;
    this.texture = null;
    this.quadBuffer = null;

    // Buffer resolution: 3x native (768 x 576) for crisp sub-pixel xBR smoothing
    this.canvas.width = BUFFER_W * 3;
    this.canvas.height = BUFFER_H * 3;

    this.initWebGL();
    this.updateCanvasStyling();
  }

  initWebGL() {
    try {
      this.gl = this.canvas.getContext("webgl", { alpha: false, depth: false, antialias: false }) ||
                this.canvas.getContext("experimental-webgl", { alpha: false, depth: false, antialias: false });
      if (!this.gl) throw new Error("WebGL no disponible");

      const gl = this.gl;

      const vsSource = `
        attribute vec2 a_position;
        varying vec2 v_texCoord;
        void main() {
          v_texCoord = a_position * 0.5 + 0.5;
          v_texCoord.y = 1.0 - v_texCoord.y;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;

      const fsClassic = `
        precision highp float;
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;
        void main() {
          gl_FragColor = texture2D(u_texture, v_texCoord);
        }
      `;

      const fsXbr = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_textureSize;
        varying vec2 v_texCoord;

        #define XBR_SCALE 3.0
        #define XBR_Y_WEIGHT 48.0
        #define XBR_EQ_THRESHOLD 15.0
        #define XBR_LV2_COEFFICIENT 2.0
        #define lv2_cf XBR_LV2_COEFFICIENT
        #define CORNER_C
        #define SMOOTH_TIPS

        const vec3 rgbw = vec3(14.352, 28.176, 5.472);

        const vec4 Ao = vec4( 1.0, -1.0, -1.0, 1.0 );
        const vec4 Bo = vec4( 1.0,  1.0, -1.0,-1.0 );
        const vec4 Co = vec4( 1.5,  0.5, -0.5, 0.5 );
        const vec4 Ax = vec4( 1.0, -1.0, -1.0, 1.0 );
        const vec4 Bx = vec4( 0.5,  2.0, -0.5,-2.0 );
        const vec4 Cx = vec4( 1.0,  1.0, -0.5, 0.0 );
        const vec4 Ay = vec4( 1.0, -1.0, -1.0, 1.0 );
        const vec4 By = vec4( 2.0,  0.5, -2.0,-0.5 );
        const vec4 Cy = vec4( 2.0,  0.0, -1.0, 0.5 );
        const vec4 Ci = vec4(0.25, 0.25, 0.25, 0.25);

        vec4 df(vec4 A, vec4 B) { return abs(A - B); }
        vec4 diff(vec4 A, vec4 B) { return step(0.001, abs(A - B)); }
        vec4 eq(vec4 A, vec4 B) { return step(df(A, B), vec4(XBR_EQ_THRESHOLD)); }
        vec4 neq(vec4 A, vec4 B) { return vec4(1.0) - eq(A, B); }
        vec4 wd(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) {
          return (df(a,b) + df(a,c) + df(d,e) + df(d,f) + 4.0*df(g,h));
        }
        float c_df(vec3 c1, vec3 c2) {
          vec3 dfc = abs(c1 - c2);
          return dfc.r + dfc.g + dfc.b;
        }

        void main() {
          float dx = 1.0 / u_textureSize.x;
          float dy = 1.0 / u_textureSize.y;

          vec4 t1 = v_texCoord.xxxy + vec4( -dx, 0.0, dx, -2.0*dy );
          vec4 t2 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,     -dy );
          vec4 t3 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,     0.0 );
          vec4 t4 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,      dy );
          vec4 t5 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,  2.0*dy );
          vec4 t6 = v_texCoord.xyyy + vec4( -2.0*dx, -dy, 0.0, dy );
          vec4 t7 = v_texCoord.xyyy + vec4(  2.0*dx, -dy, 0.0, dy );

          vec2 fp = fract(v_texCoord * u_textureSize);

          vec3 A1 = texture2D(u_texture, t1.xw).xyz;
          vec3 B1 = texture2D(u_texture, t1.yw).xyz;
          vec3 C1 = texture2D(u_texture, t1.zw).xyz;
          vec3 A  = texture2D(u_texture, t2.xw).xyz;
          vec3 B  = texture2D(u_texture, t2.yw).xyz;
          vec3 C  = texture2D(u_texture, t2.zw).xyz;
          vec3 D  = texture2D(u_texture, t3.xw).xyz;
          vec3 E  = texture2D(u_texture, t3.yw).xyz;
          vec3 F  = texture2D(u_texture, t3.zw).xyz;
          vec3 G  = texture2D(u_texture, t4.xw).xyz;
          vec3 H  = texture2D(u_texture, t4.yw).xyz;
          vec3 I  = texture2D(u_texture, t4.zw).xyz;
          vec3 G5 = texture2D(u_texture, t5.xw).xyz;
          vec3 H5 = texture2D(u_texture, t5.yw).xyz;
          vec3 I5 = texture2D(u_texture, t5.zw).xyz;
          vec3 A0 = texture2D(u_texture, t6.xy).xyz;
          vec3 D0 = texture2D(u_texture, t6.xz).xyz;
          vec3 G0 = texture2D(u_texture, t6.xw).xyz;
          vec3 C4 = texture2D(u_texture, t7.xy).xyz;
          vec3 F4 = texture2D(u_texture, t7.xz).xyz;
          vec3 I4 = texture2D(u_texture, t7.xw).xyz;

          vec4 b  = vec4(dot(B ,rgbw), dot(D ,rgbw), dot(H ,rgbw), dot(F ,rgbw));
          vec4 c  = vec4(dot(C ,rgbw), dot(A ,rgbw), dot(G ,rgbw), dot(I ,rgbw));
          vec4 d  = b.yzwx;
          vec4 e  = vec4(dot(E,rgbw));
          vec4 f  = b.wxyz;
          vec4 g  = c.zwxy;
          vec4 h  = b.zwxy;
          vec4 i  = c.wxyz;

          vec4 i4 = vec4(dot(I4,rgbw), dot(C1,rgbw), dot(A0,rgbw), dot(G5,rgbw));
          vec4 i5 = vec4(dot(I5,rgbw), dot(C4,rgbw), dot(A1,rgbw), dot(G0,rgbw));
          vec4 h5 = vec4(dot(H5,rgbw), dot(F4,rgbw), dot(B1,rgbw), dot(D0,rgbw));
          vec4 f4 = h5.yzwx;

          vec4 fx   = (Ao*fp.y+Bo*fp.x);
          vec4 fx_l = (Ax*fp.y+Bx*fp.x);
          vec4 fx_u = (Ay*fp.y+By*fp.x);

          vec4 irlv0 = diff(e,f) * diff(e,h);
          vec4 irlv1 = irlv0 * ( neq(f,b) * neq(f,c) + neq(h,d) * neq(h,g) + eq(e,i) * (neq(f,f4) * neq(f,i4) + neq(h,h5) * neq(h,i5)) + eq(e,g) + eq(e,c));

          vec4 irlv2l = diff(e,g) * diff(d,g);
          vec4 irlv2u = diff(e,c) * diff(b,c);

          vec4 delta   = vec4(1.0/XBR_SCALE);
          vec4 delta_l = vec4(0.5/XBR_SCALE, 1.0/XBR_SCALE, 0.5/XBR_SCALE, 1.0/XBR_SCALE);
          vec4 delta_u = delta_l.yxwz;

          vec4 fx45i = clamp((fx   + delta   -Co - Ci)/(2.0*delta  ), 0.0, 1.0);
          vec4 fx45  = clamp((fx   + delta   -Co     )/(2.0*delta  ), 0.0, 1.0);
          vec4 fx30  = clamp((fx_l + delta_l -Cx     )/(2.0*delta_l), 0.0, 1.0);
          vec4 fx60  = clamp((fx_u + delta_u -Cy     )/(2.0*delta_u), 0.0, 1.0);

          vec4 wd1 = wd( e, c,  g, i, h5, f4, h, f);
          vec4 wd2 = wd( h, d, i5, f, i4,  b, e, i);

          vec4 edri  = step(wd1, wd2) * irlv0;
          vec4 edr   = step(wd1 + vec4(0.1), wd2) * step(vec4(0.5), irlv1);
          vec4 edr_l = step( lv2_cf*df(f,g), df(h,c) ) * irlv2l * edr;
          vec4 edr_u = step( lv2_cf*df(h,c), df(f,g) ) * irlv2u * edr;

          fx45  = edr   * fx45;
          fx30  = edr_l * fx30;
          fx60  = edr_u * fx60;
          fx45i = edri  * fx45i;

          vec4 px = step(df(e,f), df(e,h));
          vec4 maximos = max(max(fx30, fx60), max(fx45, fx45i));

          vec3 res1 = E;
          res1 = mix(res1, mix(H, F, px.x), maximos.x);
          res1 = mix(res1, mix(B, D, px.z), maximos.z);

          vec3 res2 = E;
          res2 = mix(res2, mix(F, B, px.y), maximos.y);
          res2 = mix(res2, mix(D, H, px.w), maximos.w);

          vec3 res = mix(res1, res2, step(c_df(E, res1), c_df(E, res2)));
          gl_FragColor = vec4(res, 1.0);
        }
      `;

      const createProg = (fs) => {
        const comp = (type, src) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
          return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, comp(gl.VERTEX_SHADER, vsSource));
        gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
      };

      this.programClassic = createProg(fsClassic);
      this.programXbr = createProg(fsXbr);

      // Vertex quad buffer
      this.quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]), gl.STATIC_DRAW);

      // Texture setup
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      this.isWebGL = true;
    } catch (e) {
      console.warn("WebGL no disponible para post-procesado xBR, usando fallback 2D:", e);
      this.isWebGL = false;
      this.ctx2d = this.canvas.getContext("2d");
    }
  }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem("bobby_render_mode", mode);
    this.updateCanvasStyling();
  }

  updateCanvasStyling() {
    if (this.mode === "HD_XBR") {
      this.canvas.classList.add("mode-hd");
      this.canvas.classList.remove("mode-classic");
    } else {
      this.canvas.classList.add("mode-classic");
      this.canvas.classList.remove("mode-hd");
    }
  }

  render(sourceCanvas) {
    if (!this.isWebGL) {
      if (this.ctx2d) {
        this.ctx2d.imageSmoothingEnabled = (this.mode === "HD_XBR");
        if (this.ctx2d.imageSmoothingEnabled) this.ctx2d.imageSmoothingQuality = "high";
        this.ctx2d.drawImage(sourceCanvas, 0, 0, this.canvas.width, this.canvas.height);
      }
      return;
    }

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    const prog = (this.mode === "HD_XBR") ? this.programXbr : this.programClassic;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const posLoc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getUniformLocation(prog, "u_texture");
    gl.uniform1i(texLoc, 0);

    if (this.mode === "HD_XBR") {
      const sizeLoc = gl.getUniformLocation(prog, "u_textureSize");
      gl.uniform2f(sizeLoc, BUFFER_W, BUFFER_H);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

// --- 6. UI & CONTROLS MANAGER ---
// Bobby Carrot Remastered - UI & Universal Controls Manager

class UIManager {
  constructor(game, container, canvas, renderer) {
    this.game = game;
    this.container = container;
    this.canvas = canvas;
    this.renderer = renderer;
    this.toastTimeout = null;
    this.classSession = null;

    // References to DOM elements
    this.elements = {};
    this.initDOM();
    this.setupAutoScaling();
    this.setupInputHandlers();
    this.setupTouchControls();
    this.updateRenderModeUI();

    // Hook game state changes
    this.game.onStateChange = (state) => this.handleStateChange(state);
    this.game.onHUDToast = (msg) => this.showToast(msg);
  }

  initDOM() {
    this.elements = {
      menuOverlay: document.getElementById('menu-overlay'),
      levelSelectModal: document.getElementById('level-select-modal'),
      victoryModal: document.getElementById('victory-modal'),
      deathModal: document.getElementById('death-modal'),
      levelTitle: document.getElementById('hud-level-title'),
      timeDisplay: document.getElementById('hud-time'),
      stepsDisplay: document.getElementById('hud-steps'),
      muteBtn: document.getElementById('btn-mute'),
      fullscreenBtn: document.getElementById('btn-fullscreen'),
      campaignTitle: document.getElementById('campaign-title'),
      levelGrid: document.getElementById('level-grid'),
      btnRenderMode: document.getElementById('btn-render-mode'),
      touchBtnRenderMode: document.getElementById('touch-btn-render-mode'),
      menuModeClassic: document.getElementById('menu-mode-classic'),
      menuModeHd: document.getElementById('menu-mode-hd'),
      toast: document.getElementById('render-mode-toast'),
      tabProcedural: document.getElementById('tab-procedural'),
      proceduralOptions: document.getElementById('procedural-options'),
      diffEasy: document.getElementById('diff-easy'),
      diffNormal: document.getElementById('diff-normal'),
      diffHard: document.getElementById('diff-hard'),
      classModeBtn: document.getElementById('btn-class-mode'),
      classRoomModal: document.getElementById('class-room-modal'),
      classCampaign: document.getElementById('class-campaign'),
      classRangeStart: document.getElementById('class-range-start'),
      classRangeEnd: document.getElementById('class-range-end'),
      classStudentCount: document.getElementById('class-student-count'),
      classRoulette: document.getElementById('class-roulette'),
      classRouletteWheel: document.getElementById('class-roulette-wheel'),
      classRouletteNumber: document.getElementById('class-roulette-number'),
      classRouletteResult: document.getElementById('class-roulette-result'),
      classSpin: document.getElementById('btn-class-spin'),
      classStart: document.getElementById('btn-class-start'),
      classVolunteer: document.getElementById('btn-class-volunteer'),
      classVolunteerNumber: document.getElementById('class-volunteer-number'),
      classReset: document.getElementById('btn-class-reset'),
      classClose: document.getElementById('btn-class-close'),
    };
    this.setupClassMode();
  }

  setupAutoScaling() {
    const resize = () => {
      const header = document.querySelector('.header-bar');
      const headerH = header ? header.offsetHeight : 48;
      const touchControls = document.getElementById('touch-controls');
      const windowW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const windowH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      // The visible viewport changes when Safari expands/collapses browser UI.
      // Size the fixed game shell to that actual space instead of 100vh.
      document.body.style.height = `${Math.floor(windowH)}px`;
      const controlsVisible = touchControls && getComputedStyle(touchControls).display !== 'none';
      const sideRails = controlsVisible && window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
      const controlsH = controlsVisible && !sideRails ? touchControls.offsetHeight : 0;
      document.body.style.setProperty('--bobby-controls-height', `${controlsH}px`);
      let availableW = windowW - 12;
      let availableH = windowH - headerH - controlsH - 16;
      if (sideRails) {
        const dpadW = touchControls.querySelector('.dpad-container')?.offsetWidth || 140;
        const actionsW = touchControls.querySelector('.action-buttons')?.offsetWidth || 140;
        availableW -= dpadW + actionsW + 48;
      }
      availableW = Math.max(150, availableW);
      availableH = Math.max(110, availableH);

      // Aspect ratio de la pantalla interna 256x192 (4:3)
      const aspect = 256 / 192;
      let targetW = availableW;
      let targetH = targetW / aspect;

      if (targetH > availableH) {
        targetH = availableH;
        targetW = targetH * aspect;
      }

      this.canvas.style.width = `${Math.floor(targetW)}px`;
      this.canvas.style.height = `${Math.floor(targetH)}px`;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
    document.addEventListener('fullscreenchange', resize);
    document.addEventListener('webkitfullscreenchange', resize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }
    resize();
  }

  setupInputHandlers() {
    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
      // First interaction unlocks Safari Web Audio
      audio.init();
      if (!this.elements.classRoomModal.classList.contains('hidden')) return;

      if (e.repeat && (e.key === 'r' || e.key === 'R')) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.game.queueInput('Up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.game.queueInput('Down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.game.queueInput('Left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.game.queueInput('Right');
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          this.game.restartLevel();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          this.toggleRenderMode();
          break;
        case 'Escape':
        case 'p':
        case 'P':
          e.preventDefault();
          this.showMenu();
          break;
        case 'Enter':
        case ' ':
          if (this.game.state === 'LEVEL_COMPLETE') {
            e.preventDefault();
            this.game.nextLevel();
          } else if (this.game.state === 'DEAD') {
            e.preventDefault();
            this.game.restartLevel();
          }
          break;
      }
    });

    // Audio unlock on any first click / tap
    const unlockAudio = () => {
      audio.init();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
  }

  setupTouchControls() {
    // Virtual D-pad buttons
    const bindBtn = (id, direction) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const trigger = (e) => {
        e.preventDefault();
        audio.init();
        this.game.queueInput(direction);
      };

      btn.addEventListener('touchstart', trigger, { passive: false });
      btn.addEventListener('mousedown', trigger);
    };

    bindBtn('dpad-up', 'Up');
    bindBtn('dpad-down', 'Down');
    bindBtn('dpad-left', 'Left');
    bindBtn('dpad-right', 'Right');

    // Canvas Touch Gestures (Swipe for quick one-finger mobile play)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = performance.now();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      // Keep a swipe inside the game. Without this, Safari/Chrome may treat a
      // downward gesture as page navigation or address-bar interaction and
      // leave the immersive state.
      e.preventDefault();
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Responsive swipe sensitivity (threshold 22px)
        if (dist > 22) {
          if (Math.abs(dx) > Math.abs(dy)) {
            this.game.queueInput(dx > 0 ? 'Right' : 'Left');
          } else {
            this.game.queueInput(dy > 0 ? 'Down' : 'Up');
          }
          // Reset anchor to allow continuous sliding
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }
    }, { passive: false });
  }

  setupClassMode() {
    const els = this.elements;
    if (!els.classModeBtn || !els.classRoomModal) return;
    const fillRange = () => {
      const campaign = els.classCampaign.value;
      const length = campaign === 'Easter_Eggs' ? EGG_LEVELS.length : CARROT_LEVELS.length;
      for (const select of [els.classRangeStart, els.classRangeEnd]) {
        select.replaceChildren();
        for (let index = 0; index < length; index++) {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = `Nivel ${index + 1}`;
          select.appendChild(option);
        }
      }
      els.classRangeStart.value = '0';
      els.classRangeEnd.value = String(Math.min(14, length - 1));
    };
    els.classModeBtn.onclick = () => {
      if (!this.classSession) {
        els.classCampaign.value = this.game.campaign === 'Easter_Eggs' ? 'Easter_Eggs' : 'Carrot_Harvest';
        fillRange();
        this.prepareClassSession();
      } else {
        this.refreshClassControls();
      }
      els.classRoomModal.classList.remove('hidden');
    };
    els.classCampaign.onchange = () => { fillRange(); this.prepareClassSession(); };
    for (const select of [els.classRangeStart, els.classRangeEnd, els.classStudentCount]) {
      select.addEventListener('change', () => this.prepareClassSession());
    }
    els.classClose.onclick = () => {
      if (this.classSpinTimer) clearTimeout(this.classSpinTimer);
      this.classSpinTimer = null;
      els.classRoomModal.classList.add('hidden');
      if (this.game.state !== 'PLAYING') this.showMenu();
    };
    els.classSpin.onclick = () => this.spinClassRound();
    els.classVolunteer.onclick = () => this.spinClassRound(Number(els.classVolunteerNumber.value));
    els.classStart.onclick = () => this.startClassRound();
    els.classReset.onclick = () => this.prepareClassSession();
  }

  classConfig() {
    const els = this.elements;
    const campaign = els.classCampaign.value === 'Easter_Eggs' ? 'Easter_Eggs' : 'Carrot_Harvest';
    const max = (campaign === 'Easter_Eggs' ? EGG_LEVELS : CARROT_LEVELS).length - 1;
    const start = Math.max(0, Math.min(max, Number(els.classRangeStart.value) || 0));
    const end = Math.max(start, Math.min(max, Number(els.classRangeEnd.value) || 0));
    const count = Math.max(1, Math.min(60, Math.floor(Number(els.classStudentCount.value) || 1)));
    els.classRangeEnd.value = String(end);
    els.classStudentCount.value = String(count);
    return { campaign, start, end, count };
  }

  shuffleClassItems(items) {
    const result = items.slice();
    // Fisher–Yates: every remaining student and level is equally likely.
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  prepareClassSession() {
    const els = this.elements;
    if (this.classSpinTimer) clearTimeout(this.classSpinTimer);
    this.classSpinTimer = null;
    const { campaign, start, end, count } = this.classConfig();
    this.classSession = {
      campaign, start, end, count,
      students: this.shuffleClassItems(Array.from({ length: count }, (_, i) => i + 1)),
      levels: this.shuffleClassItems(Array.from({ length: end - start + 1 }, (_, i) => start + i)),
      currentStudent: null,
      currentLevel: null,
      pending: false,
    };
    this.classWheelRotation = 0;
    if (els.classRouletteWheel) els.classRouletteWheel.style.transform = 'rotate(0deg)';
    if (els.classRouletteNumber) els.classRouletteNumber.textContent = '?';
    if (els.classRouletteResult) els.classRouletteResult.textContent = 'Gira la ruleta o selecciona un voluntario. Después, haz tu pregunta y pulsa «Empezar nivel».';
    this.refreshClassControls();
  }

  drawClassWheel(students) {
    const canvas = this.elements.classRouletteWheel;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const center = canvas.width / 2;
    const radius = center - 8;
    const step = Math.PI * 2 / Math.max(1, students.length);
    const fills = ['#ea823b', '#66ad45', '#e7a93f', '#4eab8d'];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    students.forEach((number, index) => {
      const angle = -Math.PI / 2 + step * index;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, angle - step / 2, angle + step / 2);
      ctx.closePath();
      ctx.fillStyle = fills[index % fills.length];
      ctx.fill();
      ctx.lineWidth = students.length > 32 ? 1 : 3;
      ctx.strokeStyle = '#fff3bc';
      ctx.stroke();
      const labelRadius = radius * (students.length > 28 ? .84 : .78);
      ctx.fillStyle = '#1f341c';
      ctx.font = `900 ${students.length > 40 ? 13 : students.length > 24 ? 18 : 27}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), center + Math.cos(angle) * labelRadius, center + Math.sin(angle) * labelRadius);
    });
  }

  refreshClassControls() {
    const els = this.elements;
    const session = this.classSession;
    if (!session) return;
    const available = Array.from({ length: session.count }, (_, index) => index + 1)
      .filter((number) => session.students.includes(number));
    const wheelStudents = session.pending
      ? [...available, session.currentStudent].sort((a, b) => a - b)
      : available;
    this.drawClassWheel(wheelStudents);
    const selected = els.classVolunteerNumber.value;
    els.classVolunteerNumber.replaceChildren(new Option('Número', ''));
    for (const number of available) els.classVolunteerNumber.add(new Option(`Alumno ${number}`, String(number)));
    if (available.some((number) => String(number) === selected)) els.classVolunteerNumber.value = selected;
    els.classSpin.disabled = session.pending || !available.length;
    els.classVolunteer.disabled = session.pending || !available.length;
    els.classVolunteerNumber.disabled = session.pending || !available.length;
    els.classClose.disabled = !!this.classSpinTimer;
    els.classStart.disabled = !session.pending || !!this.classSpinTimer;
    els.classStart.classList.toggle('hidden', !session.pending);
    if (!available.length && !session.pending) {
      els.classRouletteResult.textContent = 'Todos los alumnos ya jugaron. Pulsa «Nueva ruleta» para repetir la clase.';
    }
  }

  spinClassRound(voluntaryNumber) {
    const els = this.elements;
    const session = this.classSession;
    if (!session || session.pending || !session.students.length || this.classSpinTimer) return;
    if (voluntaryNumber !== undefined && !session.students.includes(voluntaryNumber)) {
      els.classRouletteResult.textContent = 'Selecciona el número del alumno voluntario.';
      return;
    }
    const remaining = Array.from({ length: session.count }, (_, index) => index + 1)
      .filter((number) => session.students.includes(number));
    const student = voluntaryNumber === undefined ? session.students.shift() : voluntaryNumber;
    if (voluntaryNumber !== undefined) session.students.splice(session.students.indexOf(student), 1);
    if (!session.levels.length) {
      session.levels = this.shuffleClassItems(Array.from({ length: session.end - session.start + 1 }, (_, i) => session.start + i));
    }
    session.currentStudent = student;
    session.currentLevel = session.levels.shift();
    session.pending = true;
    this.drawClassWheel(remaining);
    const index = remaining.indexOf(student);
    const sector = 360 / remaining.length;
    const rotation = this.classWheelRotation || 0;
    const alignment = (360 - ((rotation + index * sector) % 360)) % 360;
    this.classWheelRotation = rotation + (4 + Math.floor(Math.random() * 3)) * 360 + alignment;
    els.classRouletteNumber.textContent = '…';
    els.classRouletteResult.textContent = 'La ruleta está girando…';
    els.classRouletteWheel.style.transform = `rotate(${this.classWheelRotation}deg)`;
    this.classSpinTimer = setTimeout(() => {
      this.classSpinTimer = null;
      els.classRouletteNumber.textContent = String(student);
      els.classRouletteResult.textContent = `${voluntaryNumber === undefined ? 'La ruleta eligió' : 'Voluntario'}: alumno ${student} · ${session.campaign === 'Easter_Eggs' ? 'Huevos' : 'Zanahorias'} nivel ${session.currentLevel + 1}. Haz la pregunta; después pulsa «Empezar nivel».`;
      this.refreshClassControls();
    }, 1600);
    this.refreshClassControls();
  }

  startClassRound() {
    const session = this.classSession;
    if (!session || !session.pending || this.classSpinTimer) return;
    session.pending = false;
    this.hideMenu();
    this.elements.classRoomModal.classList.add('hidden');
    if (!(document.fullscreenElement || document.webkitFullscreenElement)) this.toggleFullscreen();
    this.game.campaign = session.campaign;
    this.game.startLevel(session.currentLevel);
  }

  toggleMute() {
    const isMuted = audio.toggleMute();
    if (this.elements.muteBtn) {
      this.elements.muteBtn.innerHTML = isMuted ? '🔇' : '🔊';
      this.elements.muteBtn.title = isMuted ? 'Activar sonido (M)' : 'Silenciar sonido (M)';
    }
  }

  toggleFullscreen() {
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (!active) {
      const root = document.documentElement;
      let request = null;
      if (root.requestFullscreen) request = root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) request = root.webkitRequestFullscreen();
      if (request && typeof request.catch === 'function') request.catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    if (this.elements.fullscreenBtn) this.elements.fullscreenBtn.innerHTML = '⛶';
  }

  showMenu() {
    if (this.classSpinTimer) clearTimeout(this.classSpinTimer);
    this.classSpinTimer = null;
    this.elements.menuOverlay.classList.remove('hidden');
    this.elements.levelSelectModal.classList.add('hidden');
    this.elements.victoryModal.classList.add('hidden');
    this.elements.deathModal.classList.add('hidden');
    this.elements.classRoomModal?.classList.add('hidden');
  }

  hideMenu() {
    this.elements.menuOverlay.classList.add('hidden');
    this.elements.levelSelectModal.classList.add('hidden');
    this.elements.victoryModal.classList.add('hidden');
    this.elements.deathModal.classList.add('hidden');
  }

  openLevelSelect(campaign) {
    if (campaign) this.game.campaign = campaign;
    if (this.game.campaign === 'Procedural') {
      this.elements.campaignTitle.innerText = '🎲 AVENTURA PROCEDURAL';
      this.elements.levelGrid.innerHTML = '<p style="text-align:center;padding:1rem;opacity:0.7;">Los niveles procedurales se generan al azar.<br>¡Presiona Jugar para uno nuevo!</p>';
      this.elements.levelSelectModal.classList.remove('hidden');
      return;
    }
    const isCarrot = this.game.campaign === 'Carrot_Harvest';
    this.elements.campaignTitle.innerText = isCarrot ? 'ZANAHORIAS (CARROT HARVEST)' : 'HUEVOS DE PASCUA (EASTER EGGS)';

    const list = this.game.getLevelList();
    const unlockedMax = this.game.saveData.unlocked[this.game.campaign] || 0;
    const scores = this.game.saveData.scores[this.game.campaign] || {};

    this.elements.levelGrid.innerHTML = '';
    list.forEach((_, idx) => {
      const btn = document.createElement('button');
      btn.className = 'level-card';
      const isUnlocked = idx <= unlockedMax;

      if (isUnlocked) {
        btn.classList.add('unlocked');
        const score = scores[idx];
        let bestText = '';
        if (score && score.time < 999999) {
          const s = Math.floor(score.time);
          bestText = `<span class="score-pill">⏱ ${s}s • 👣 ${score.steps}</span>`;
        }
        btn.innerHTML = `<strong>${idx + 1}</strong>${bestText}`;
        btn.onclick = () => {
          this.classSession = null;
          this.hideMenu();
          this.game.startLevel(idx);
        };
      } else {
        btn.classList.add('locked');
        btn.innerHTML = `<span>🔒 ${idx + 1}</span>`;
      }

      this.elements.levelGrid.appendChild(btn);
    });

    this.elements.levelSelectModal.classList.remove('hidden');
  }

  handleStateChange(state) {
    if (state === 'LEVEL_COMPLETE') {
      const s = Math.floor(this.game.level.time);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      document.getElementById('modal-vic-time').innerText = `${mm}:${ss}`;
      document.getElementById('modal-vic-steps').innerText = String(this.game.level.steps);
      if (this.game.campaign === 'Procedural') {
        const diffText = this.game.proceduralDifficulty === 'easy' ? 'Fácil' : (this.game.proceduralDifficulty === 'hard' ? 'Difícil' : 'Normal');
        document.getElementById('modal-vic-level').innerText = `Procedural (${diffText}) — Nivel ${this.game.proceduralLevelNumber || 1}`;
      } else {
        document.getElementById('modal-vic-level').innerText = `Nivel ${this.game.levelIndex + 1}`;
      }
      if (this.classSession) {
        this.elements.victoryModal.classList.add('hidden');
        this.elements.classRoomModal.classList.remove('hidden');
        if (this.elements.classRouletteResult) this.elements.classRouletteResult.textContent = `¡Nivel superado por el alumno ${this.classSession.currentStudent}! Gira para continuar.`;
        this.refreshClassControls();
      } else {
        this.elements.victoryModal.classList.remove('hidden');
      }
    } else if (state === 'DEAD') {
      if (this.classSession) {
        this.elements.deathModal.classList.add('hidden');
        this.elements.classRoomModal.classList.remove('hidden');
        if (this.elements.classRouletteResult) this.elements.classRouletteResult.textContent = `El alumno ${this.classSession.currentStudent} cayó en una trampa. Gira para el siguiente turno.`;
        this.refreshClassControls();
      } else {
        this.elements.deathModal.classList.remove('hidden');
      }
    } else if (state === 'PLAYING') {
      this.elements.victoryModal.classList.add('hidden');
      this.elements.deathModal.classList.add('hidden');
    }
  }

  updateHUD(level, steps, time) {
    if (this.elements.levelTitle) {
      if (this.game.campaign === 'Procedural') {
        const diff = this.game.proceduralDifficulty === 'easy' ? '🟢' : this.game.proceduralDifficulty === 'hard' ? '🔴' : '🟡';
        this.elements.levelTitle.innerText = `${diff} 🎲 Procedural • Nivel ${this.game.proceduralLevelNumber || 1}`;
      } else {
        const mode = this.game.campaign === 'Carrot_Harvest' ? '🥕' : '🥚';
        this.elements.levelTitle.innerText = `${mode} Nivel ${this.game.levelIndex + 1}`;
      }
    }
  }

  showToast(message) {
    if (!this.elements.toast) return;
    this.elements.toast.textContent = message;
    this.elements.toast.classList.remove('hidden');
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      if (this.elements.toast) this.elements.toast.classList.add('hidden');
    }, 1600);
  }

  toggleRenderMode() {
    if (!this.renderer) return;
    const newMode = (this.renderer.mode === 'HD_XBR') ? 'CLASSIC' : 'HD_XBR';
    this.setRenderMode(newMode);
  }

  setRenderMode(mode) {
    if (!this.renderer) return;
    this.renderer.setMode(mode);
    this.updateRenderModeUI();
    const label = (mode === 'HD_XBR') ? '✨ Modo Gráfico: HD Suave (Filtro xBR)' : '👾 Modo Gráfico: Pixel Art Clásico';
    this.showToast(label);
  }

  updateRenderModeUI() {
    if (!this.renderer) return;
    const isHD = (this.renderer.mode === 'HD_XBR');
    if (this.elements.btnRenderMode) {
      this.elements.btnRenderMode.textContent = isHD ? '✨ HD' : '👾 Clásico';
      this.elements.btnRenderMode.title = isHD
        ? 'Modo Actual: HD Suave xBR (Presiona H para Clásico)'
        : 'Modo Actual: Pixel Art Clásico (Presiona H para HD xBR)';
    }
    if (this.elements.touchBtnRenderMode) {
      this.elements.touchBtnRenderMode.textContent = isHD ? '✨ Modo HD' : '👾 Clásico';
    }
    if (this.elements.menuModeHd) {
      this.elements.menuModeHd.classList.toggle('active', isHD);
    }
    if (this.elements.menuModeClassic) {
      this.elements.menuModeClassic.classList.toggle('active', !isHD);
    }
  }
}

// --- 6. BOOTSTRAP INITIALIZATION ---
async function startApp() {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  // Virtual game buffer (256 x 192)
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = BUFFER_W;
  offscreenCanvas.height = BUFFER_H;
  const offscreenCtx = offscreenCanvas.getContext("2d");
  offscreenCtx.imageSmoothingEnabled = false;

  // Initialize Post-Processing Renderer on game-canvas
  const renderer = new PostProcessingRenderer(canvas);

  // Loading Screen
  offscreenCtx.fillStyle = "#0d131a";
  offscreenCtx.fillRect(0, 0, BUFFER_W, BUFFER_H);
  offscreenCtx.fillStyle = "#ff7b00";
  offscreenCtx.font = "10px monospace";
  offscreenCtx.textAlign = "center";
  offscreenCtx.fillText("CARGANDO BOBBY CARROT...", BUFFER_W / 2, BUFFER_H / 2);
  renderer.render(offscreenCanvas);

  // Load Sprites
  const sprites = new SpriteManager();
  await sprites.loadAll();

  // Initialize Game & UI
  const game = new BobbyGame(sprites);
  const ui = new UIManager(game, document.body, canvas, renderer);
  window.game = game;
  window.ui = ui;

  // Hook Render Mode buttons
  if (ui.elements.btnRenderMode) {
    ui.elements.btnRenderMode.onclick = () => ui.toggleRenderMode();
  }
  if (ui.elements.touchBtnRenderMode) {
    ui.elements.touchBtnRenderMode.onclick = () => ui.toggleRenderMode();
  }
  if (ui.elements.menuModeClassic) {
    ui.elements.menuModeClassic.onclick = () => ui.setRenderMode("CLASSIC");
  }
  if (ui.elements.menuModeHd) {
    ui.elements.menuModeHd.onclick = () => ui.setRenderMode("HD_XBR");
  }

  // Hook UI elements
  const btnPlay = document.getElementById("btn-play");
  if (btnPlay) {
    btnPlay.onclick = () => {
      ui.classSession = null;
      ui.hideMenu();
      // User gesture: this is the most reliable moment to request immersive
      // mode on Android Chrome and desktop browsers. iOS Safari may decline it,
      // in which case the in-game fullscreen button remains available.
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) ui.toggleFullscreen();
      if (game.campaign === 'Procedural') {
        game.startProceduralLevel(game.proceduralDifficulty);
      } else {
        const unlocked = game.saveData.unlocked[game.campaign] || 0;
        game.startLevel(unlocked);
      }
    };
  }

  // Automatic testing / preview parameter
  if (window.location.search.includes("mode=procedural")) {
    game.campaign = "Procedural";
    if (window.location.search.includes("diff=hard")) game.proceduralDifficulty = "hard";
    else if (window.location.search.includes("diff=easy")) game.proceduralDifficulty = "easy";
    else game.proceduralDifficulty = "normal";
    setTimeout(() => {
      ui.hideMenu();
      game.startProceduralLevel(game.proceduralDifficulty);
    }, 300);
  } else if (window.location.search.includes("autoplay=1")) {
    setTimeout(() => {
      if (btnPlay) btnPlay.click();
    }, 150);
  }

  const btnRestart = document.getElementById("btn-restart");
  if (btnRestart) btnRestart.onclick = () => game.restartLevel();

  const touchRestart = document.getElementById("touch-btn-restart");
  if (touchRestart) touchRestart.onclick = () => game.restartLevel();

  const btnMenu = document.getElementById("btn-menu");
  if (btnMenu) btnMenu.onclick = () => ui.showMenu();

  const btnLevels = document.getElementById("btn-levels");
  if (btnLevels) btnLevels.onclick = () => ui.openLevelSelect();

  const touchLevels = document.getElementById("touch-btn-levels");
  if (touchLevels) touchLevels.onclick = () => ui.openLevelSelect();

  const btnOpenLevels = document.getElementById("btn-open-levels");
  if (btnOpenLevels) btnOpenLevels.onclick = () => ui.openLevelSelect();

  const btnCloseLevels = document.getElementById("btn-close-levels");
  if (btnCloseLevels) {
    btnCloseLevels.onclick = () => {
      document.getElementById("level-select-modal").classList.add("hidden");
    };
  }

  const btnNext = document.getElementById("btn-next-level");
  if (btnNext) btnNext.onclick = () => game.nextLevel();

  const btnReplay = document.getElementById("btn-replay-level");
  if (btnReplay) btnReplay.onclick = () => game.restartLevel();

  const btnRetryDeath = document.getElementById("btn-retry-death");
  if (btnRetryDeath) btnRetryDeath.onclick = () => game.restartLevel();

  const btnMenuDeath = document.getElementById("btn-menu-death");
  if (btnMenuDeath) btnMenuDeath.onclick = () => ui.showMenu();

  const btnMute = document.getElementById("btn-mute");
  if (btnMute) btnMute.onclick = () => ui.toggleMute();

  const btnFull = document.getElementById("btn-fullscreen");
  if (btnFull) btnFull.onclick = () => ui.toggleFullscreen();

  // Campaign switcher tabs
  const tabCarrot = document.getElementById("tab-carrot");
  const tabEggs = document.getElementById("tab-eggs");
  const tabProcedural = document.getElementById("tab-procedural");

  if (tabCarrot) {
    tabCarrot.onclick = () => {
      game.campaign = "Carrot_Harvest";
      tabCarrot.classList.add("active");
      tabEggs.classList.remove("active");
      if (tabProcedural) tabProcedural.classList.remove("active");
      const procOpts = document.getElementById("procedural-options");
      if (procOpts) procOpts.classList.add("hidden");
    };
  }

  if (tabEggs) {
    tabEggs.onclick = () => {
      game.campaign = "Easter_Eggs";
      tabEggs.classList.add("active");
      tabCarrot.classList.remove("active");
      if (tabProcedural) tabProcedural.classList.remove("active");
      const procOpts = document.getElementById("procedural-options");
      if (procOpts) procOpts.classList.add("hidden");
    };
  }

  if (tabProcedural) {
    tabProcedural.onclick = () => {
      game.campaign = "Procedural";
      tabProcedural.classList.add("active");
      if (tabCarrot) tabCarrot.classList.remove("active");
      if (tabEggs) tabEggs.classList.remove("active");
      // Show procedural options, hide standard play options
      const procOpts = document.getElementById("procedural-options");
      if (procOpts) procOpts.classList.remove("hidden");
    };
  }

  const diffBtns = {
    easy: document.getElementById("diff-easy"),
    normal: document.getElementById("diff-normal"),
    hard: document.getElementById("diff-hard"),
  };
  Object.entries(diffBtns).forEach(([diff, btn]) => {
    if (btn) {
      btn.onclick = () => {
        game.proceduralDifficulty = diff;
        Object.values(diffBtns).forEach((b) => {
          if (b) b.classList.remove("active");
        });
        btn.classList.add("active");
      };
    }
  });

  const btnReset = document.getElementById("btn-reset-save");
  if (btnReset) {
    btnReset.onclick = () => {
      if (confirm("¿Seguro que deseas reiniciar tu progreso y récords guardados?")) {
        localStorage.removeItem("bobby_carrot_save");
        game.saveData = game.loadSaveData();
        alert("Progreso reiniciado.");
      }
    };
  }

  // Game Loop
  let lastTime = performance.now();
  function gameLoop(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (ui.elements.classRoomModal.classList.contains('hidden')) game.update(dt);
    game.render(offscreenCtx);
    renderer.render(offscreenCanvas);

    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
})();
