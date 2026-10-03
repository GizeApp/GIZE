#!/usr/bin/env bash
# Downloads the "trend" type set for the off-guideline pieces into fonts/trend/ (git-ignored: the files are not
# ours to redistribute) and writes fonts/trend/trend.css with local URLs. Brand pieces keep using Outfit.
#   Switzer           Indian Type Foundry, Fontshare, ITF Free Font License (personal and commercial use)
#   Instrument Serif  Rodrigo Fuenzalida / Jordan Egstad, Google Fonts, SIL OFL 1.1 (stand-in for Athelas, paid)
#   Archivo Expanded  Omnibus-Type, Google Fonts, SIL OFL 1.1 (stand-in for Nofex, personal use only)
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p trend; cd trend
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
: > trend.css
# Switzer: one static file per weight
curl -fsS -A "$UA" 'https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800,900&display=swap' |
  awk '/font-weight:/{gsub(/[^0-9]/,"",$2);print w" "$2}/woff2/{match($0,/\/\/cdn\.fontshare\.com[^'"'"']*\.woff2/);w=substr($0,RSTART,RLENGTH)}' |
  while read -r url wt; do f="switzer-$wt.woff2"; curl -fsS -o "$f" "https:$url"
    printf "@font-face{font-family:'Switzer';font-style:normal;font-weight:%s;font-display:block;src:url('%s') format('woff2');}\n" "$wt" "$f" >> trend.css; done
# Google Fonts: latin + latin-ext subsets only
gf(){ local fam="$1" q="$2" name="$3" style="$4" wt="$5"
  curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?family=$q&display=swap" |
    awk -v s="$style" '/^\/\* /{sub_=$2}/font-style:/{st=$2;gsub(/;/,"",st)}/src:/{if(st==s&&(sub_=="latin"||sub_=="latin-ext")){match($0,/https:[^)]*/);u=substr($0,RSTART,RLENGTH)}}/unicode-range/{if(u!=""){r=$0;sub(/^ *unicode-range: */,"",r);sub(/;$/,"",r);print sub_"\t"u"\t"r;u=""}}' |
    while IFS=$'\t' read -r sub url range; do f="$name-$sub.woff2"; curl -fsS -o "$f" "$url"
      printf "@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:block;src:url('%s') format('woff2');unicode-range:%s;}\n" "$fam" "$style" "$wt" "$f" "$range" >> trend.css; done; }
gf 'Instrument Serif' 'Instrument+Serif:ital@1' instrument-serif-italic italic 400
gf 'Instrument Serif' 'Instrument+Serif' instrument-serif normal 400
gf 'Archivo Expanded' 'Archivo:wdth,wght@125,700..900' archivo-expanded normal '700 900'
ls -la; cat trend.css | cut -c1-140
