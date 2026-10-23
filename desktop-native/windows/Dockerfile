# A throwaway Fedora image that cross-compiles the Windows build of native Pager with MinGW (nothing Windows is needed on your computer).
# Used by desktop-native/windows/build.sh; delete the image afterwards with: docker rmi pager-native-win
FROM docker.io/library/fedora:42
RUN dnf -y install --setopt=install_weak_deps=False \
      mingw64-gcc-c++ mingw64-qt6-qtbase mingw64-qt6-qtdeclarative mingw64-qt6-qtsvg mingw64-qt6-qtshadertools \
      qt6-qtbase-devel qt6-qtbase-private-devel qt6-qtdeclarative-devel qt6-qtshadertools-devel qt6-qtsvg-devel \
      mingw64-filesystem mingw32-nsis mingw64-nsis cmake ninja-build make nasm perl golang \
      rust cargo rust-std-static-x86_64-pc-windows-gnu \
      tar gzip findutils which file && dnf clean all
