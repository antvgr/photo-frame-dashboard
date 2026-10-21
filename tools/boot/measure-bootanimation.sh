#!/system/bin/sh
# Mesure la durée réelle de lecture de la partie 0 de l'animation (lecture seule, hors écriture système).
up() { cut -d' ' -f1 /proc/uptime; }
setprop service.bootanim.exit 1
t0=$(up)
setprop ctl.start bootanim
n=0; while [ "$(getprop init.svc.bootanim)" != "running" ] && [ $n -lt 100 ]; do n=$((n+1)); done
t1=$(up)
while [ "$(getprop init.svc.bootanim)" = "running" ]; do :; done
t2=$(up)
echo "demarrage=$t0 en_marche=$t1 fin=$t2"
