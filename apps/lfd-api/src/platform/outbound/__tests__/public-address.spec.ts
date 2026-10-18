import { classifyAddress } from "../public-address.js";

describe("les adresses qu'un webhook sortant ne vise jamais", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.10.20.30", "loopback"],
    ["::1", "loopback"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.10", "private"],
    ["100.64.0.1", "private"],
    ["fd12:3456::1", "private"],
    ["169.254.1.1", "link-local"],
    ["fe80::1", "link-local"],
    ["169.254.169.254", "metadata"],
    ["fd00:ec2::254", "metadata"],
    ["100.100.100.200", "metadata"],
    ["0.0.0.0", "reserved"],
    ["::", "reserved"],
    ["224.0.0.1", "reserved"],
    ["255.255.255.255", "reserved"],
    ["192.0.2.1", "reserved"],
    ["::ffff:127.0.0.1", "reserved"],
    ["::ffff:10.0.0.1", "reserved"],
    ["64:ff9b::7f00:1", "reserved"],
    ["2002:7f00:1::1", "reserved"],
    ["ff02::1", "reserved"],
    ["agence.example", "not-an-address"],
  ])("%s est refusée (%s)", (address, reason) => {
    expect(classifyAddress(address)).toEqual({ open: false, reason });
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"])(
    "%s est ouverte",
    (address) => {
      expect(classifyAddress(address)).toEqual({ open: true });
    },
  );
});
