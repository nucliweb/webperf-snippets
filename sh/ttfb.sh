#!/usr/bin/env bash
#
# Shows time in seconds to first byte of a url or urls
#
# Based on a gist https://gist.github.com/sandeepraju/1f5fbdbdd89551ba7925abe2645f92b5
# by https://github.com/sandeepraju
#
# Modified by jay@gooby.org, @jaygooby
#
# Usage: ttfb [options] url [url...]
#   -d debug
#   -l <log file> (infers -d) log response headers. Defaults to ./curl.log
#   -n <number> of times to test time to first byte
#   -v verbose output. Show request breakdown during -n calls
#
# Examples:
#
# ttfb https://example.com/example/url
# .098974
#
# ttfb -n 5 https://example.com/
# .....
# fastest .099195 slowest .103138 median .099684
#
# ttfb -n 5 bbc.co.uk news.bbc.co.uk
# .....
# .....
# bbc.co.uk       fastest .045873 slowest .046870 median .045999
# news.bbc.co.uk  fastest .042286 slowest .060245 median .046035
#
# ttfb bbc.co.uk news.bbc.co.uk
# bbc.co.uk        .048378
# news.bbc.co.uk   .049303
#
# Implicitly follows redirects using curl's -L option.
#
# Log all response headers (default log file is ./curl.log) by calling with -d
#
# Override the default log file by specifying -l /some/file
#
# Get min, max and median values by specifying the number of times to call
# the URL; use -n2 for 2 tests, -n5 for 5 and so on.
#
# If you specify more than one url and have specified -d or -l, the log file
# will be prefixed with the URL being requested.
#
# If you specify -n and -d or -l, the response headers from the consecutive
# requests will be concatenated in the log file.
#
# See https://blog.cloudflare.com/a-question-of-timing/
# and https://curl.haxx.se/docs/manpage.html for an explanation
# of how the curl variables relate to the various stages of
# the transfer.
#
# To get a better approximation of devtool's TTFB, consider
# the time without the connection overhead:
# %{time_starttransfer} - %{time_appconnect}
#
# Uses a dirty eval to do the ttfb arithmetic. Depends
# on bc and column commands.
set -eu

# check dependencies
for dependency in curl bc column; do
  which $dependency > /dev/null || (echo "You need to have '$dependency' installed and in your \$PATH" >&2 && exit 1)
done

# Ensure curl uses period separators for floating point values, which
# bc requires to do calculations (i.e. it can't use locale separators like ,)
if (locale -a | egrep ^C.UTF-8$ > /dev/null); then
  export LC_ALL=C.UTF-8
else
  export LC_ALL=C
fi

# check curl can use http2
HTTP_VERSION="--http2"
curl -so /dev/null --http2 https://example.com || HTTP_VERSION="--http1.1"

# Cribbed from https://stackoverflow.com/a/41762669/391826
median() {
  arr=($(printf '%s\n' "${@}" | sort -n))
  nel=${#arr[@]}
  if (( $nel % 2 == 1 )); then     # Odd number of elements
    val="${arr[ $(($nel/2)) ]}"
  else                            # Even number of elements
    (( j=nel/2 ))
    (( k=j-1 ))
    val=$(echo "scale=6;(${arr[j]}" + "${arr[k]})"/2|bc -l)
  fi
  echo $val
}

show_usage() {
  echo -e "Usage: ttfb [options] url [url...]\n\t-d debug\n\t-l <log file> (infers -d) log response headers. Defaults to ./curl.log\n\t-n <number> of times to test time to first byte\n\t-v verbose output. Show response breakdown (DNS lookup, TLS handshake etc)" >&2
}

# defaults
DEBUG=""
LOG=""
NUM_REQUESTS=0
VERBOSE=0

while getopts ":n:dl:v" OPTION
do
    case $OPTION in
        d) DEBUG=1 ;;
        l) LOG="$OPTARG" ;;
        n) NUM_REQUESTS=$OPTARG ;;
        v) VERBOSE=1 ;;
        \?) show_usage
            exit 1
            ;;
    esac
done

shift $((OPTIND - 1))  # shifts away every option argument,
                       # leaving urls as $@

if [ -z "${1:-}" ]; then
  show_usage
  exit 1
else
  URLS="$@"
fi

# if we're given a custom log file, or log directory, implicitly set DEBUG=1
[ -n "$LOG" ] && DEBUG=1

# default the log file to curl.log in pwd or LOG_DIRECTORY if -o was specified
LOG="${LOG:-curl.log}"

# now work out if $LOG is relative or an absolute path
# and then get the dirname
[ "$LOG" != "${LOG#/}" ] && LOG_DIRECTORY=$(dirname "$LOG") || LOG_DIRECTORY=$(dirname "${PWD}/$LOG")
if [ ! -d "$LOG_DIRECTORY" ]; then
   echo "Log directory $LOG_DIRECTORY doesn't exist" >&2
   exit 1;
fi

# then set the actual log filename
LOG=$(basename "$LOG")

DEBUG=${DEBUG:-0}

options=()
options+=(-o /dev/null)
options+=(-s)
options+=(-L)
options+=($HTTP_VERSION)
options+=(-H 'Cache-Control: no-cache')
options+=(-w 'echo DNS lookup: %{time_namelookup} TLS handshake: %{time_appconnect} TTFB including connection: %{time_starttransfer} TTFB: $(echo %{time_starttransfer} - %{time_appconnect} | bc) Total time: %{time_total} \n')
if [ $DEBUG -eq 1 ]; then
  options+=(-D "${LOG_DIRECTORY}/${LOG}")
fi

for URL in $URLS; do

  # if we're checking more than one url
  # output the url on the results line
  if [ ${#@} -gt 1 ]; then
    SHOW_URL="${URL}|"
    if [[ $VERBOSE -eq 1 && -n "$NUM_REQUESTS" && "$NUM_REQUESTS" -gt 1 ]]; then
      echo $URL >&2
    fi
  else
    SHOW_URL=""
  fi

  # if multiple requests have been specified, then show min, max & median values
  if [[ -n "$NUM_REQUESTS" && "$NUM_REQUESTS" -gt 1 ]]; then
    ttfbs=()
    for i in $(seq $NUM_REQUESTS); do

      # if we're checking more than one url, and debug is set, then log
      # the headers to a per-url file, but also for each request
      if [[ ${#@} -gt 1 && $DEBUG -eq 1 ]]; then
        LOGFILE="${URL//[^[:alnum:]]/_}"
        options+=(-D "${LOG_DIRECTORY}/${LOGFILE}-${LOG}_${i}")
      elif [ $DEBUG -eq 1 ]; then
        # we only have the one URL, but we still are requesting multiple
        # ttfb calls, so log the headers
        options+=(-D "${LOG_DIRECTORY}/${LOG}_${i}")
      fi

      request=$(eval $(curl "${options[@]}" "$URL"))
      ttfbs+=($(echo $request | grep -oE "TTFB: .{0,7}" | cut -d' ' -f2 | sort -n));
      if [ $VERBOSE -eq 1 ]; then
        echo "$request" >&2
      else
        printf "." >&2
      fi
    done

    # tidy up - combine multiple request logs for the same url into a single file
    if [[ ${#@} -gt 1 && $DEBUG -eq 1 ]]; then
      cat "${LOG_DIRECTORY}/${LOGFILE}-${LOG}_"* > "${LOG_DIRECTORY}/${LOGFILE}-${LOG}"
      rm "${LOG_DIRECTORY}/${LOGFILE}-${LOG}_"*
    elif [ $DEBUG -eq 1 ]; then
      cat "${LOG_DIRECTORY}/${LOG}_"* > "${LOG_DIRECTORY}/${LOG}"
      rm "${LOG_DIRECTORY}/${LOG}_"*
    fi

    printf "\n" >&2
    # sort the times
    ttfbs=( $( printf "%s\n" "${ttfbs[@]}" | sort -n ) )
    # show quickest, slowest and median fftb
    printf "${SHOW_URL}\e[32mfastest \e[39m${ttfbs[0]} \e[91mslowest \e[39m${ttfbs[${#ttfbs[*]}-1]} \e[95mmedian \e[39m$(median ${ttfbs[*]})\e[39m\n";
  else
   if [ $VERBOSE -eq 1 ]; then
     echo -e $SHOW_URL $(eval $(curl "${options[@]}" "$URL"))
   else
     echo -e $SHOW_URL $(eval $(curl "${options[@]}" "$URL") | grep -oE "TTFB: .{0,7}" | cut -d' ' -f2)
   fi
  fi
done | column -s'|' -t