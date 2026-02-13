function redirectDevice() {
  const ua = navigator.userAgent.toLowerCase();

  /* =========================
     📺 SMART TV PLATFORMS
     ========================= */
  const isTV =
    (ua.includes("android") && ua.includes("tv")) ||
    ua.includes("google tv") ||
    ua.includes("chromecast") ||
    ua.includes("appletv") ||
    ua.includes("tizen") ||
    ua.includes("orsay") ||
    ua.includes("webos") ||
    ua.includes("netcast") ||
    ua.includes("aft") ||
    ua.includes("fire tv") ||
    ua.includes("roku") ||
    ua.includes("vidaa") ||
    ua.includes("mitv") ||
    ua.includes("patchwall") ||
    ua.includes("miui tv") ||
    ua.includes("bravia") ||
    ua.includes("my homescreen") ||
    ua.includes("firefox") ||
    ua.includes("saphi") ||
    ua.includes("aquos") ||
    ua.includes("smartcast") ||
    ua.includes("sky") ||
    ua.includes("rdk") ||
    ua.includes("x1") ||
    ua.includes("hbbtv") ||
    ua.includes("opentv") ||
    ua.includes("enigma2") ||
    ua.includes("playstation") ||
    ua.includes("xbox");

  /* =========================
     📱 MOBILE DEVICES
     ========================= */
  const isMobile =
    ua.includes("iphone") ||
    ua.includes("ipod") ||
    (ua.includes("android") && !ua.includes("tv")) ||
    ua.includes("ipad") ||
    ua.includes("mobile") ||
    ua.includes("harmonyos") ||
    ua.includes("kaios") ||
    ua.includes("sailfish") ||
    ua.includes("ubuntu touch") ||
    ua.includes("postmarketos") ||
    ua.includes("mobian") ||
    ua.includes("plasma mobile") ||
    ua.includes("windows phone") ||
    ua.includes("symbian") ||
    ua.includes("blackberry") ||
    ua.includes("bb10");

  /* =========================
     💻 DESKTOP / LAPTOP
     ========================= */
  const isDesktop =
    ua.includes("windows nt") ||
    ua.includes("macintosh") ||
    ua.includes("mac os x") ||
    ua.includes("linux") ||
    ua.includes("x11") ||
    ua.includes("cros") ||        // ChromeOS
    ua.includes("bsd") ||
    ua.includes("unix");

  setTimeout(() => {
    if (isTV) {
      window.location.href = "../tv/tv.html";
    } else if (isMobile) {
      window.location.href = "../mobile/mobile.html";
    } else if (isDesktop) {
      window.location.href = "../desktop/desktop.html";
    } else {
      // fallback
      window.location.href = "./index.html";
    }
  }, 2000);
}

window.onload = redirectDevice;
