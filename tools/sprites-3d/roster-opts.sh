# The warband roster's per-character options, shared by roster.sh (baked renders) and export.sh (live 3D models).
# Sourced from the repo root. P is the props file.
P=tools/sprites-3d/props.py
# slug: render options (props and grafted parts on bones, size, and a clip's body turn or bow release)
declare -A OPTS=(
  [raider-hooded]="--add=tools/sprites-3d/raider_codex.py:blade"
  [raider-goggles]="--prop=$P:knife@RightHand"
  [archer]="--prop=$P:bow@LeftHand --release=archery_shot:39 --yaw=archery_shot:-90:14:30:48:58"   # the clip shoots out of its left side
  [shieldbearer]="--prop=$P:spear@RightHand --prop=$P:shield@LeftForeArm"
  [hooker]="--prop=$P:hook@RightHand"
  [chieftain]="--prop=$P:maul@RightHand --canvas=96 --height=1.8"
  [wizard]="--prop=$P:staff~0.1@RightHand --firm=sword_slash --canvas=64 --height=1.28"   # 1.4x the code wizard (the user: 1.7 too big)
)
# the wizard also carries every conjured weapon and guard (wizprops.py), hidden: the game shows the one the seat holds
# (--show: the props shown when the game names none; baked renders take only the staff)
W=tools/sprites-3d/wizprops.py
WIZ_ARMS="--show=staff"
for a in sword earthmaul focus frostspear whip trident; do WIZ_ARMS="$WIZ_ARMS --prop=$W:$a~0.25@RightHand"; done
# the bow is held in the left hand and drawn with the right, as the archer's; its clip turns the body sideways, as the archer's
WIZ_ARMS="$WIZ_ARMS --prop=$W:icebow~0.25@LeftHand --release=archery_shot:39 --yaw=archery_shot:-90:24:31:48:58"
# guards are soft too (round 3): kept upright, picture-up toward the sky, whatever the forearm does (wizprops.py PROP_AXIS)
for a in mirror bulwark ember rime spark tide prism leaf spike; do WIZ_ARMS="$WIZ_ARMS --prop=$W:$a~0.15@LeftForeArm"; done
# slug: its folder under tools/sprites-3d/output when it isn't the slug
declare -A DIR=([raider-hooded]=meshy-rig)
ROSTER=(raider-hooded raider-goggles archer shieldbearer hooker chieftain wizard)
