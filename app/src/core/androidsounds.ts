/** Notification sounds from the Android Open Source Project (Apache License 2.0, see public/sounds/android/NOTICE.txt). Played from files the app ships with. */
export const ANDROID_SOUNDS: [string, string, string][] = [
 [
  "android-aldebaran",
  "Android: Aldebaran",
  "Aldebaran.ogg"
 ],
 [
  "android-altair",
  "Android: Altair",
  "Altair.ogg"
 ],
 [
  "android-antares",
  "Android: Antares",
  "Antares.ogg"
 ],
 [
  "android-beat-box-android",
  "Android: Beat Box Android",
  "Beat_Box_Android.ogg"
 ],
 [
  "android-bees-knees",
  "Android: Bees Knees",
  "Bees_Knees.ogg"
 ],
 [
  "android-betelgeuse",
  "Android: Betelgeuse",
  "Betelgeuse.ogg"
 ],
 [
  "android-canopus",
  "Android: Canopus",
  "Canopus.ogg"
 ],
 [
  "android-capella",
  "Android: Capella",
  "Capella.ogg"
 ],
 [
  "android-castor",
  "Android: Castor",
  "Castor.ogg"
 ],
 [
  "android-cetialpha",
  "Android: CetiAlpha",
  "CetiAlpha.ogg"
 ],
 [
  "android-cheeper",
  "Android: Cheeper",
  "Cheeper.ogg"
 ],
 [
  "android-cricket",
  "Android: Cricket",
  "Cricket.ogg"
 ],
 [
  "android-deneb",
  "Android: Deneb",
  "Deneb.ogg"
 ],
 [
  "android-doink",
  "Android: Doink",
  "Doink.ogg"
 ],
 [
  "android-drip",
  "Android: Drip",
  "Drip.ogg"
 ],
 [
  "android-electra",
  "Android: Electra",
  "Electra.ogg"
 ],
 [
  "android-fomalhaut",
  "Android: Fomalhaut",
  "Fomalhaut.ogg"
 ],
 [
  "android-heaven",
  "Android: Heaven",
  "Heaven.ogg"
 ],
 [
  "android-im-me",
  "Android: IM Me",
  "IM_Me.ogg"
 ],
 [
  "android-merope",
  "Android: Merope",
  "Merope.ogg"
 ],
 [
  "android-plastic-pipe",
  "Android: Plastic Pipe",
  "Plastic_Pipe.ogg"
 ],
 [
  "android-polaris",
  "Android: Polaris",
  "Polaris.ogg"
 ],
 [
  "android-pollux",
  "Android: Pollux",
  "Pollux.ogg"
 ],
 [
  "android-procyon",
  "Android: Procyon",
  "Procyon.ogg"
 ],
 [
  "android-shortcircuit",
  "Android: ShortCircuit",
  "ShortCircuit.ogg"
 ],
 [
  "android-sirrah",
  "Android: Sirrah",
  "Sirrah.ogg"
 ],
 [
  "android-spaceseed",
  "Android: SpaceSeed",
  "SpaceSeed.ogg"
 ],
 [
  "android-star-struck",
  "Android: Star Struck",
  "Star_Struck.ogg"
 ],
 [
  "android-tada",
  "Android: TaDa",
  "TaDa.ogg"
 ],
 [
  "android-tinkerbell",
  "Android: Tinkerbell",
  "Tinkerbell.ogg"
 ],
 [
  "android-aidos",
  "Android: aidos",
  "aidos.ogg"
 ],
 [
  "android-arcturus",
  "Android: arcturus",
  "arcturus.ogg"
 ],
 [
  "android-circios",
  "Android: circios",
  "circios.ogg"
 ],
 [
  "android-horkos",
  "Android: horkos",
  "horkos.ogg"
 ],
 [
  "android-hypnos1",
  "Android: hypnos1",
  "hypnos1.ogg"
 ],
 [
  "android-kratos1",
  "Android: kratos1",
  "kratos1.ogg"
 ],
 [
  "android-kratos2",
  "Android: kratos2",
  "kratos2.ogg"
 ],
 [
  "android-moonbeam",
  "Android: moonbeam",
  "moonbeam.ogg"
 ],
 [
  "android-nomos1",
  "Android: nomos1",
  "nomos1.ogg"
 ],
 [
  "android-nomos2",
  "Android: nomos2",
  "nomos2.ogg"
 ],
 [
  "android-ouranos",
  "Android: ouranos",
  "ouranos.ogg"
 ],
 [
  "android-phantasos",
  "Android: phantasos",
  "phantasos.ogg"
 ],
 [
  "android-pixiedust",
  "Android: pixiedust",
  "pixiedust.ogg"
 ],
 [
  "android-pizzicato",
  "Android: pizzicato",
  "pizzicato.ogg"
 ],
 [
  "android-poros",
  "Android: poros",
  "poros.ogg"
 ],
 [
  "android-regulus",
  "Android: regulus",
  "regulus.ogg"
 ],
 [
  "android-sirius",
  "Android: sirius",
  "sirius.ogg"
 ],
 [
  "android-thrasos1",
  "Android: thrasos1",
  "thrasos1.ogg"
 ],
 [
  "android-tweeters",
  "Android: tweeters",
  "tweeters.ogg"
 ],
 [
  "android-vega",
  "Android: vega",
  "vega.ogg"
 ]
];
export const androidSoundFile = (id: string) => ANDROID_SOUNDS.find((s) => s[0] === id)?.[2];
