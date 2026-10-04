"use client";

import { useId } from 'react';
import './flying-cat-art.css';

type PilotCatProps = {
  className?: string;
  flying?: boolean;
  protected?: boolean;
  worried?: boolean;
};

/** Lightweight paper-cut illustration: the same pilot on the cover and in flight. */
export function PilotCat({ className = '', flying = true, protected: shielded = false, worried = false }: PilotCatProps) {
  const id = useId().replace(/:/g, '');
  const orange = `${id}-orange`;
  const fur = `${id}-fur`;
  const energy = `${id}-energy`;

  return (
    <svg
      viewBox="75 30 340 230"
      className={`fc-art-pilot ${flying ? 'fc-art-pilot--flying' : ''} ${shielded ? 'fc-art-pilot--protected' : ''} ${worried ? 'fc-art-pilot--worried' : ''} ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={orange} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#e59163" />
          <stop offset="0.48" stopColor="#cf6340" />
          <stop offset="1" stopColor="#ab452b" />
        </linearGradient>
        <linearGradient id={fur} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e5c491" />
          <stop offset="1" stopColor="#bd9861" />
        </linearGradient>
        <radialGradient id={energy} cx="42%" cy="35%" r="65%">
          <stop offset="0" stopColor="#b8f3ff" stopOpacity="0.02" />
          <stop offset="0.66" stopColor="#65d8ff" stopOpacity="0.06" />
          <stop offset="0.88" stopColor="#36b8ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#087ef0" stopOpacity="0.48" />
        </radialGradient>
      </defs>

      {shielded && (
        <g className="fc-art-energy-sphere" data-testid="flying-cat-energy-shield">
          <circle cx="245" cy="145" r="165" fill={`url(#${energy})`} stroke="#239aff" strokeWidth="4" />
          <circle cx="245" cy="145" r="164" fill="none" stroke="#51cfff" strokeWidth="17" opacity="0.13" />
          <circle cx="245" cy="145" r="159" fill="none" stroke="#b5f4ff" strokeWidth="2" opacity="0.67" />
          <path d="M121 42 A162 162 0 0 1 324 1 M376 52 A162 162 0 0 1 400 198" fill="none" stroke="#e6fbff" strokeWidth="6" strokeLinecap="round" opacity="0.9" />
          <path d="m95 131 8-12 8 12-8 12Z m281 119 6-9 6 9-6 9Z" fill="#baf7ff" opacity="0.85" />
        </g>
      )}

      {/* A bounded set of reusable puffs; no particle allocations during play. */}
      <g className="fc-art-smoke" fill="#fff9e9">
        <circle className="fc-art-puff fc-art-puff--one" cx="112" cy="188" r="12" />
        <circle className="fc-art-puff fc-art-puff--two" cx="105" cy="186" r="10" />
        <circle className="fc-art-puff fc-art-puff--three" cx="98" cy="184" r="8" />
      </g>

      <g className="fc-art-airplane" strokeLinejoin="round" strokeLinecap="round">
        {/* Far wing, undercarriage and tail are behind the fuselage. */}
        <path d="M252 167 336 115 Q351 107 365 113 L347 127 292 179Z" fill="#c66040" stroke="#fff2da" strokeWidth="3" />
        <path d="m259 200 17 37 m30-41 18 32 m-46-21 35 27" fill="none" stroke="#243e53" strokeWidth="7" />
        <ellipse cx="276" cy="244" rx="14" ry="16" fill="#243e53" stroke="#efe4cd" strokeWidth="3" />
        <ellipse cx="331" cy="235" rx="13" ry="15" fill="#243e53" stroke="#efe4cd" strokeWidth="3" />
        <path d="M260 241 Q269 221 287 235 L294 244Z M314 234 Q327 213 343 227 L349 235Z" fill="#be512e" stroke="#f8edda" strokeWidth="2.5" />
        <path d="m133 181-18-88 q6-9 14 0l42 64Z" fill="#ba4e2f" stroke="#f8edda" strokeWidth="4" />
        <path d="m117 99 9 66 20-1-17-66Z" fill="#253e53" />

        {/* Scarf trails out of the cockpit, like the original watercolor cover. */}
        <g className="fc-art-scarf">
          <path d="M263 116 C216 133 199 99 160 108 S116 105 103 96 L100 118 C123 130 142 128 164 127 S208 149 256 132Z" fill="#6e8e66" stroke="#f2edd9" strokeWidth="4" />
          <path d="M250 126 C217 132 208 121 182 135 S140 153 126 147 L132 161 C154 166 173 158 190 152 S217 147 255 143Z" fill="#8b9d70" stroke="#f2edd9" strokeWidth="4" />
          <path d="m111 103-5 17 m25-11-3 17 m26-17-2 16 m25-9-6 16 m28-5-8 16 m28-5-6 14 m23-16-5 14 M145 147l5 15m17-20 5 13m20-16 3 13m21-18 1 12" fill="none" stroke="#e8e7c9" strokeWidth="8" />
        </g>

        {/* Tan tabby pilot, brown leather cap and goggles on the forehead. */}
        <path d="M255 157 259 126 Q282 114 308 130 L314 164Z" fill={`url(#${fur})`} stroke="#514735" strokeWidth="3" />
        <path d="m264 132 12 10-17 1m42-14-13 13 18 2m-41 6 12 9m27-8-15 7" fill="none" stroke="#6d6244" strokeWidth="5" />
        <path d="m252 74 1-40 24 22 24-3 24-21 4 41Z" fill={`url(#${fur})`} stroke="#584634" strokeWidth="4" />
        <path d="m258 42 3 20 11-5Z m62-1 2-20-13 13Z" fill="#b57865" />
        <path d="M253 69 Q244 111 266 129 Q282 141 306 127 Q328 112 325 73 Q290 51 253 69Z" fill={`url(#${fur})`} stroke="#574b34" strokeWidth="3.5" />
        <path d="M253 69 Q260 50 285 50 Q309 48 325 67 L322 91 Q302 68 275 77 L254 96Z" fill="#7c5237" />
        <path d="M254 75 249 111 255 122 264 110 264 81" fill="#835636" stroke="#efdbb6" strokeWidth="2" />
        <path d="m269 81 5 13m12-18 3 16m13-15 4 14m-49 20 14 3m-10 8 12 1m38-20-12 4m10 8-10 3" fill="none" stroke="#6a603f" strokeWidth="5" />
        <g className="fc-art-face" data-testid={worried ? 'flying-cat-worried-face' : undefined}>
          {worried ? <>
            <path d="m269 88 12-4m17-1 13 4" fill="none" stroke="#65513a" strokeWidth="2.5" />
            <ellipse cx="278" cy="100" rx="10" ry="9" fill="#faf4da" />
            <ellipse cx="304" cy="99" rx="10" ry="9" fill="#faf4da" />
            <ellipse cx="280" cy="101" rx="3.4" ry="6.5" fill="#283c35" />
            <ellipse cx="302" cy="100" rx="3.4" ry="6.5" fill="#283c35" />
          </> : <>
            <path d="M269 98 Q275 88 283 98 L283 106 270 107Z M295 97 Q303 87 310 98 L309 106 296 106Z" fill="#faf4da" />
            <ellipse cx="279" cy="99" rx="3.4" ry="7" fill="#283c35" />
            <ellipse cx="305" cy="98" rx="3.4" ry="7" fill="#283c35" />
          </>}
          <ellipse cx="291" cy="119" rx="20" ry="13" fill="#f4e2bb" />
          <path d="m285 108 12-1-5 7Z" fill="#70533e" />
          {worried ? <ellipse cx="292" cy="121" rx="4.5" ry="5" fill="#614c3a" />
            : <path d="m292 114 1 5q-5 6-11 0m11 0q6 5 11-2" fill="none" stroke="#614c3a" strokeWidth="2.3" />}
          <path d="M268 113 249 109m19 11-21 4m60-12 20-4m-21 11 20 4" fill="none" stroke="#4b4536" strokeWidth="1.8" />
          {worried && <path d="M320 90q-7 10-3 13 5 3 7-2 1-3-4-11Z" fill="#9cdae2" stroke="#476879" strokeWidth="1" />}
        </g>
        <path d="M258 68 Q289 58 321 65" fill="none" stroke="#213f55" strokeWidth="7" />
        <ellipse cx="277" cy="65" rx="14" ry="10" fill="#efdeb5" stroke="#544633" strokeWidth="4" transform="rotate(-10 277 65)" />
        <ellipse cx="307" cy="62" rx="12" ry="10" fill="#efdeb5" stroke="#544633" strokeWidth="4" transform="rotate(8 307 62)" />
        <path d="m269 61 10-2m22 0 7-1" fill="none" stroke="#fff7df" strokeWidth="3" />
        <path d="M263 129 Q283 142 305 131 L302 146 Q280 150 259 139Z" fill="#748b62" stroke="#f5ecd7" strokeWidth="3" />
        <path d="m271 134 1 10m12-7 1 10m11-11-1 9" stroke="#e8e2c0" strokeWidth="5" />

        {/* Long fuselage, navy cowl, visible windscreen and distinct near wing. */}
        <path d="M117 174 Q169 163 233 158 Q250 179 289 165 L322 147 Q344 143 367 159 L374 197 Q307 216 229 204 L128 189Z" fill={`url(#${orange})`} stroke="#fff2da" strokeWidth="4" />
        <path d="M142 175 Q207 167 238 171 M294 174 Q327 161 352 167" fill="none" stroke="#edb58a" strokeWidth="6" opacity="0.5" />
        <path d="m131 187 235-9" fill="none" stroke="#203c52" strokeWidth="6" />
        <path d="M235 158 Q255 179 289 165 L307 154" fill="none" stroke="#233f56" strokeWidth="6" />
        <path d="m297 155 5-23q1-4 5-1l14 19Z" fill="#d9ebea" stroke="#263f53" strokeWidth="3" />
        <path d="M239 188 328 185 249 239 Q231 246 208 237 L188 229Z" fill="#d47751" stroke="#fff2da" strokeWidth="4" />
        <path d="m246 192 23-1-55 47-25-9Z" fill="#233f56" />
        <path d="m139 181-49 18q-6 5 2 6l68-5 30-16Z" fill="#c66541" stroke="#f8edda" strokeWidth="3" />
        <path d="M354 153 Q367 152 376 160 L382 188 Q375 200 363 201 L352 200Z" fill="#243e53" stroke="#efe4cd" strokeWidth="3.5" />
        <path d="m359 160 4 30" fill="none" stroke="#547181" strokeWidth="3" opacity="0.65" />
        <g className="fc-art-propeller">
          <ellipse cx="388" cy="174" rx="5" ry="46" fill="#203b50" stroke="#f8edda" strokeWidth="2.5" />
          <ellipse cx="388" cy="174" rx="12" ry="41" fill="#e6f0e7" opacity="0.17" />
        </g>
        <path d="M378 165 Q402 168 402 176 Q400 183 378 182Z" fill="#c45b35" stroke="#e7ab7b" strokeWidth="2" />
        <circle cx="386" cy="174" r="5" fill="#e9ae72" />
      </g>
    </svg>
  );
}

type CrashArtProps = { className?: string };

/** The empty plane separates into paper-cut pieces while the pilot falls separately. */
export function PilotCatWreck({ className = '' }: CrashArtProps) {
  return (
    <svg viewBox="75 30 340 230" className={`fc-art-wreck ${className}`} aria-hidden="true" focusable="false">
      <g strokeLinejoin="round" strokeLinecap="round">
        <g className="fc-art-wreck-smoke" fill="#8a9290">
          <circle cx="246" cy="174" r="21" />
          <circle cx="237" cy="157" r="18" />
          <circle cx="264" cy="158" r="16" />
        </g>
        <path className="fc-art-crash-flash" d="m249 138 7 15 20-13-9 20 22 6-22 8 12 18-22-8-12 18-1-20-23 4 13-15-15-10 20-2Z" fill="#f3d68e" />
        <g className="fc-art-wreck-tail">
          <path d="m133 181-18-88q6-9 14 0l42 64Z" fill="#ba4e2f" stroke="#f8edda" strokeWidth="4" />
          <path d="m117 99 9 66 20-1-17-66Z" fill="#253e53" />
          <path d="M117 174 Q169 163 229 158 L248 170 231 183 250 194 230 204 128 189Z" fill="#c66040" stroke="#fff2da" strokeWidth="4" />
          <path d="m131 187 101-4" fill="none" stroke="#203c52" strokeWidth="6" />
          <path d="m139 181-49 18q-6 5 2 6l68-5 30-16Z" fill="#c66541" stroke="#f8edda" strokeWidth="3" />
        </g>
        <g className="fc-art-wreck-nose">
          <path d="M262 161 Q281 173 301 160 L322 147 Q344 143 367 159 L374 197 Q322 211 264 205 L249 193 268 180 251 170Z" fill="#cf6340" stroke="#fff2da" strokeWidth="4" />
          <path d="m272 181 94-3" fill="none" stroke="#203c52" strokeWidth="6" />
          <path d="m297 155 5-23q1-4 5-1l14 19Z" fill="#d9ebea" stroke="#263f53" strokeWidth="3" />
          <path d="M354 153 Q367 152 376 160 L382 188 Q375 200 363 201 L352 200Z" fill="#243e53" stroke="#efe4cd" strokeWidth="3.5" />
          <path d="m310 208 19 28" stroke="#243e53" strokeWidth="7" />
          <ellipse cx="331" cy="238" rx="13" ry="15" fill="#243e53" stroke="#efe4cd" strokeWidth="3" />
          <path d="M314 237 Q327 216 343 230 L349 238Z" fill="#be512e" stroke="#f8edda" strokeWidth="2.5" />
          <path d="M382 169 Q399 169 399 177 L383 184Z" fill="#c45b35" stroke="#e7ab7b" strokeWidth="2" />
          <path d="m387 170-16-31 6-5 14 37m-2 9 15 31-7 5-13-33" fill="#203b50" stroke="#f8edda" strokeWidth="2.5" />
        </g>
        <g className="fc-art-wreck-wing">
          <path d="M239 188 328 185 249 239 Q231 246 208 237 L188 229Z" fill="#d47751" stroke="#fff2da" strokeWidth="4" />
          <path d="m246 192 23-1-55 47-25-9Z" fill="#233f56" />
        </g>
      </g>
    </svg>
  );
}

/** Surprised, unharmed tabby in the same cap and scarf; the game animates the fall. */
export function FallingPilotCat({ className = '' }: CrashArtProps) {
  return (
    <svg viewBox="0 0 240 280" className={`fc-art-falling-cat ${className}`} aria-hidden="true" focusable="false">
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d="M135 186 Q174 201 190 172 Q207 145 218 162 Q227 183 204 207 Q179 232 148 221Z" fill="#c4a56f" stroke="#65533b" strokeWidth="4" />
        <path d="m187 191 9 8m7-20 10 7" fill="none" stroke="#746343" strokeWidth="7" />
        <path d="M83 203 50 243 Q48 258 64 256 L104 226 M141 211 171 248 Q185 255 190 240 L161 199" fill="#d3b47c" stroke="#f5e8cc" strokeWidth="5" />
        <path d="m60 239 10 10m91-18 11-7" stroke="#746343" strokeWidth="6" />
        <ellipse cx="121" cy="179" rx="47" ry="57" fill="#d9bb81" stroke="#66563b" strokeWidth="4" />
        <ellipse cx="121" cy="185" rx="26" ry="39" fill="#efdebb" />
        <path d="m80 160 20 9m-18 16 19 3m59-28-18 9m21 18-19 2" fill="none" stroke="#766443" strokeWidth="7" />
        <path d="M87 151 42 136 Q23 130 21 115 Q26 100 38 115 L96 124 M156 151 196 123 Q214 111 212 96 Q205 85 196 101 L145 124" fill="#d9bb81" stroke="#f5e8cc" strokeWidth="5" />
        <path d="m44 121 4 15m127-20 10 10" fill="none" stroke="#766443" strokeWidth="7" />
        <g className="fc-art-fall-scarf">
          <path d="M95 126 Q72 123 68 91 Q63 56 38 49 L32 62 Q49 74 49 98 Q53 134 88 145Z" fill="#748c65" stroke="#f3ead4" strokeWidth="4" />
          <path d="m39 60 9-8m0 25 16-4m-14 29 19-4m-9 24 14-9" fill="none" stroke="#e8e4c6" strokeWidth="8" />
        </g>
        <path d="m76 77-4-46 31 23 34-2 24-29 6 52Z" fill="#d9bb81" stroke="#65533b" strokeWidth="4" />
        <path d="m78 40 5 21 11-6m58-10-8 12 13 6" fill="#b87d69" />
        <path d="M78 68 Q63 102 82 130 Q102 153 137 139 Q166 127 165 79 Q136 54 103 59Z" fill="#d9bb81" stroke="#66563b" strokeWidth="4" />
        <path d="M75 76 Q78 49 116 47 Q149 45 164 70 L161 87 Q125 65 93 83L78 107Z" fill="#7c5237" />
        <path d="m80 81-9 33 8 11 10-28" fill="#835636" stroke="#efdbb6" strokeWidth="2" />
        <path d="m100 78 4 10m16-14 3 11m13-9 5 10m-59 27 16 4m-11 8 12 1m51-15-12 6" fill="none" stroke="#756440" strokeWidth="5" />
        <ellipse cx="102" cy="101" rx="15" ry="17" fill="#fff8de" />
        <ellipse cx="140" cy="100" rx="15" ry="17" fill="#fff8de" />
        <ellipse cx="104" cy="103" rx="5" ry="10" fill="#2d3e36" />
        <ellipse cx="138" cy="102" rx="5" ry="10" fill="#2d3e36" />
        <path d="M91 82q10-8 20-3m18-1q12-8 21 0" fill="none" stroke="#66533a" strokeWidth="3" />
        <ellipse cx="122" cy="125" rx="22" ry="14" fill="#f2dfb5" />
        <path d="m116 112 12-1-6 8Z" fill="#70533e" />
        <ellipse cx="122" cy="130" rx="6" ry="8" fill="#73513f" />
        <path d="m94 119-21-5m19 13-22 4m75-13 22-4m-20 12 21 5" fill="none" stroke="#65563b" strokeWidth="2" />
        <path d="M83 67 Q119 55 157 62" fill="none" stroke="#213f55" strokeWidth="7" />
        <ellipse cx="104" cy="62" rx="16" ry="11" fill="#efdeb5" stroke="#544633" strokeWidth="4" transform="rotate(-9 104 62)" />
        <ellipse cx="141" cy="59" rx="14" ry="11" fill="#efdeb5" stroke="#544633" strokeWidth="4" transform="rotate(7 141 59)" />
        <path d="m95 58 12-2m28-1 9-1" stroke="#fff7df" strokeWidth="3" />
        <path d="M89 140 Q116 154 148 139 L147 154 Q113 166 88 152Z" fill="#748b62" stroke="#f5ecd7" strokeWidth="3" />
        <path d="m100 145 1 11m15-9 1 11m14-12 1 9" stroke="#e8e2c0" strokeWidth="6" />
      </g>
    </svg>
  );
}
